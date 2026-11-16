import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createCatalog,filters,DiscoveryError} from './catalog.mjs';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const secureHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const homePolicy="default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
function send(res,status,body){res.writeHead(status,{...secureHeaders,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));}
const files=new Map([['/',['index.html','text/html']],['/home.js',['home.js','text/javascript']],['/home.css',['home.css','text/css']]]);
export function createHome({origin=process.env.HOME_ORIGIN??'http://localhost:3105',practiceUrl=process.env.PRACTICE_URL??'http://linear-algebra-experimental-workspace-1:3000',
 practiceOrigin=process.env.PRACTICE_ORIGIN??'http://localhost:3100',catalog=createCatalog({practiceOrigin:practiceUrl}),fetcher=fetch}={}){
 async function upstream(req,path,{method=req.method,body}={}){
  const headers={Accept:req.headers.accept??'*/*'};
  if(req.headers.cookie)headers.Cookie=req.headers.cookie;
  if(req.headers['content-type'])headers['Content-Type']=req.headers['content-type'];
  if(method==='POST'||req.headers.origin)headers.Origin=practiceOrigin;
  return fetcher(practiceUrl+path,{method,headers,body,redirect:'manual',signal:AbortSignal.timeout(40000)});
 }
 async function recent(req,res){
  const values=(req.headers.cookie??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith('discovery_recent=')).map(v=>v.slice(17));
  if(values.length!==1||!uuid.test(values[0]))return send(res,200,{status:'none'});
  const id=values[0],href='/practice?session='+encodeURIComponent(id);
  try{
   const response=await upstream(req,'/api/sessions/'+id);
   if(!response.ok)return send(res,200,{status:response.status===404?'unavailable':'temporarily-unavailable',href});
   const value=await response.json(),entries=await catalog.practice();
   if(value.session?.id!==id)throw Error();
   const entry=entries.find(e=>e.id===value.session.exerciseId);
   return send(res,200,{status:'available',href,title:entry?.title??'Your saved exercise',topic:entry?.chapter??null});
  }catch{return send(res,200,{status:'temporarily-unavailable',href});}
 }
 return createServer(async(req,res)=>{
  try{
   if((req.url??'').length>6000)throw new DiscoveryError('INVALID_FILTER');
   const url=new URL(req.url,origin),isApi=url.pathname.startsWith('/api/');
   if(isApi&&(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&req.headers.origin!==origin))throw new DiscoveryError('ORIGIN_REJECTED',403);
   if(req.method==='GET'&&url.pathname==='/health')return send(res,200,{ok:true});
   if(req.method==='GET'&&files.has(url.pathname)){
    const [file,type]=files.get(url.pathname);
    // Old player session links reaching the home are preserved explicitly.
    if(url.pathname==='/'&&url.searchParams.has('session')){
     const id=url.searchParams.get('session');if(!uuid.test(id))throw new DiscoveryError('INVALID_SESSION');
     res.writeHead(302,{...secureHeaders,Location:'/practice?session='+encodeURIComponent(id)});return res.end();
    }
    res.writeHead(200,{...secureHeaders,'Content-Security-Policy':homePolicy,'Content-Type':type+'; charset=utf-8'});
    res.end(readFileSync(new URL('./public/'+file,import.meta.url)));return;
   }
   if(url.pathname.startsWith('/api/discovery/')){
    if(req.method!=='GET')throw new DiscoveryError('METHOD_NOT_ALLOWED',405);
    if(url.pathname==='/api/discovery/overview'){
     if(url.search)throw new DiscoveryError('INVALID_FILTER');
     return send(res,200,await catalog.overview());
    }
    const input=filters(url.searchParams);
    if(url.pathname==='/api/discovery/search')return send(res,200,await catalog.search(input));
    if(url.pathname==='/api/discovery/topics')return send(res,200,await catalog.topics(input));
    throw new DiscoveryError('NOT_FOUND',404);
   }
   if(req.method==='GET'&&url.pathname==='/api/sessions/recent'&&!url.search)return await recent(req,res);
   const session=/^\/api\/sessions(?:\/[a-f0-9-]{36}(?:\/answers)?)?$/.test(url.pathname);
   const asset=/^\/assets\/[a-zA-Z0-9_./-]+$/.test(url.pathname)&&!url.pathname.includes('..');
   const player=url.pathname==='/practice';
   const exercise=url.pathname==='/api/exercises';
   if(!(player||asset||session||exercise))throw new DiscoveryError('NOT_FOUND',404);
   if(req.method!=='GET'&&!(req.method==='POST'&&session))throw new DiscoveryError('METHOD_NOT_ALLOWED',405);
   if((session||exercise)&&url.search)throw new DiscoveryError('INVALID_FILTER');
   if(player&&(req.method!=='GET'||[...url.searchParams.keys()].some(k=>k!=='session')||url.searchParams.has('session')&&!uuid.test(url.searchParams.get('session'))))throw new DiscoveryError('INVALID_SESSION');
   let body;
   if(req.method==='POST'){
    if(req.headers.origin!==origin)throw new DiscoveryError('ORIGIN_REJECTED',403);
    const chunks=[];let length=0;
    try{for await(const chunk of req.iterator({destroyOnReturn:false})){length+=chunk.length;if(length>8192)throw new DiscoveryError('BODY_TOO_LARGE',413);chunks.push(chunk);}}
    finally{req.resume();}
    body=Buffer.concat(chunks);
   }
   let response;
   try{response=await upstream(req,(player?'/':url.pathname)+url.search,{body});}catch{throw new DiscoveryError('PRACTICE_UNAVAILABLE',503);}
   const headers={...secureHeaders,'Content-Type':response.headers.get('content-type')??'application/octet-stream'};
   for(const name of ['content-security-policy','location','allow'])if(response.headers.has(name))headers[name]=response.headers.get(name);
   const cookies=response.headers.getSetCookie();
   const data=Buffer.from(await response.arrayBuffer());
   if(session&&response.ok){
    try{const value=JSON.parse(data);if(uuid.test(value.session?.id??''))cookies.push('discovery_recent='+value.session.id+'; HttpOnly; SameSite=Strict; Path=/api/sessions; Max-Age=2592000'+(origin.startsWith('https:')?'; Secure':''));}catch{}
   }
   if(cookies.length)headers['Set-Cookie']=cookies;
   res.writeHead(response.status,headers);res.end(data);
  }catch(error){
   const code=error instanceof DiscoveryError?error.code:'REQUEST_FAILED';
   send(res,error instanceof DiscoveryError?error.status:500,{error:{code,message:code==='CATALOG_CHANGED'?'The library changed. Restart this search.':code==='CATALOG_UNAVAILABLE'||code==='CATALOG_BUSY'?'The library is temporarily unavailable. Please retry.':code==='PRACTICE_UNAVAILABLE'?'Practice is temporarily unavailable. Your saved work has been kept.':'The request could not be completed.'}});
  }
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const server=createHome();server.listen(3005,'0.0.0.0');
 process.on('SIGTERM',()=>{server.closeAllConnections();server.close(()=>process.exit(0));});
}
