import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createCatalog,filters,DiscoveryError} from './catalog.mjs';
import {chooser,chooserInput,createPracticePlan} from './chooser.mjs';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const secureHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const homePolicy="default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
function send(res,status,body){res.writeHead(status,{...secureHeaders,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));}
const files=new Map([['/',['index.html','text/html']],['/home.js',['home.js','text/javascript']],['/home.css',['home.css','text/css']],['/browse',['chooser.html','text/html']],['/chooser.js',['chooser.js','text/javascript']],['/chooser.css',['chooser.css','text/css']],['/practice-plan-store.js',['practice-plan-store.js','text/javascript']],['/account',['account.html','text/html']],['/progress',['account.html','text/html']],['/account.js',['account.js','text/javascript']],['/account.css',['account.css','text/css']]]);
export function createHome({origin=process.env.HOME_ORIGIN??'http://localhost:3105',practiceUrl=process.env.PRACTICE_URL??'http://linear-algebra-experimental-workspace-1:3000',
 practiceOrigin=process.env.PRACTICE_ORIGIN??'http://localhost:3100',catalog=createCatalog({practiceOrigin:practiceUrl}),fetcher=fetch}={}){
 async function upstream(req,path,{method=req.method,body}={}){
  const headers={Accept:req.headers.accept??'*/*'};
  if(req.headers.cookie)headers.Cookie=req.headers.cookie;
  if(req.headers['content-type'])headers['Content-Type']=req.headers['content-type'];
  if(req.headers['idempotency-key'])headers['Idempotency-Key']=req.headers['idempotency-key'];
  if(method==='POST'||req.headers.origin)headers.Origin=practiceOrigin;
  return fetcher(practiceUrl+path,{method,headers,body,redirect:'manual',signal:AbortSignal.timeout(40000)});
 }
 async function recent(req,res){
  const values=(req.headers.cookie??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith('discovery_recent=')).map(v=>v.slice(17));
  let accountSet=null;
  if((req.headers.cookie??'').split(';').some(part=>part.trim().startsWith('mathpractice_account='))){
   try{
    const response=await upstream(req,'/api/sessions/account/continuation');
    if(response.status===401)return send(res,200,{status:'authentication-required',href:'/account'});
    if(!response.ok)throw Error();
    const continuation=await response.json();values.splice(0);
    if(continuation&&uuid.test(continuation.sessionId)){values.push(continuation.sessionId);accountSet=continuation.setId;}
   }catch{return send(res,200,{status:'temporarily-unavailable'});}
  }
  if(values.length!==1||!uuid.test(values[0]))return send(res,200,{status:'none'});
  let id=values[0];let href='/practice?session='+encodeURIComponent(id);
  const setValues=(req.headers.cookie??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith('discovery_recent_set=')).map(v=>v.slice(21));
  if(accountSet&&uuid.test(accountSet))setValues.splice(0,setValues.length,accountSet);
  if(setValues.length===1&&uuid.test(setValues[0])){
   try{
    const response=await upstream(req,'/api/sessions/sets/'+setValues[0]);
    if(response.ok){const value=await response.json(),position=value.set?.items?.findIndex(item=>item.sessionId===id);
     if(value.set?.id===setValues[0]&&position>=0)href+='&set='+encodeURIComponent(setValues[0])+'&item='+position;}
   }catch{}
  }
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
   if(url.pathname==='/api/discovery/practice-plans'){
    if(req.method!=='POST')throw new DiscoveryError('METHOD_NOT_ALLOWED',405);
    if(req.headers.origin!==origin)throw new DiscoveryError('ORIGIN_REJECTED',403);
    if(req.headers['content-type']?.split(';')[0]!=='application/json')throw new DiscoveryError('INVALID_TOPIC');
    let body='',length=0;
    try{for await(const chunk of req.iterator({destroyOnReturn:false})){length+=chunk.length;if(length>2048)throw new DiscoveryError('BODY_TOO_LARGE',413);body+=chunk;}}finally{req.resume();}
    let input;try{input=JSON.parse(body);}catch{throw new DiscoveryError('INVALID_TOPIC');}
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.entries(input).some(([key,value])=>!['view','subject','chapter','section'].includes(key)||typeof value!=='string'))throw new DiscoveryError('INVALID_TOPIC');
    const selection=chooserInput(new URLSearchParams(input));
    return send(res,201,{plan:createPracticePlan(await catalog.practice(),selection)});
   }
   if(url.pathname==='/api/discovery/chooser'){
    if(req.method!=='GET')throw new DiscoveryError('METHOD_NOT_ALLOWED',405);
    return send(res,200,await chooser(catalog,chooserInput(url.searchParams)));
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
   const account=/^\/api\/sessions\/account\/(?:status|signup|login|logout|claim|bookmarks|progress|continuation)$/.test(url.pathname),draft=/^\/api\/sessions\/[a-f0-9-]{36}\/draft$/.test(url.pathname);
   const session=account||draft||/^\/api\/sessions(?:\/[a-f0-9-]{36}(?:\/answers)?)?$/.test(url.pathname)||/^\/api\/sessions\/sets(?:\/[a-f0-9-]{36}(?:\/(?:open|position))?)?$/.test(url.pathname);
   const asset=/^\/assets\/[a-zA-Z0-9_./-]+$/.test(url.pathname)&&!url.pathname.includes('..');
   const player=url.pathname==='/practice';
   const exercise=url.pathname==='/api/exercises';
   if(!(player||asset||session||exercise))throw new DiscoveryError('NOT_FOUND',404);
   if(req.method!=='GET'&&!(req.method==='POST'&&session))throw new DiscoveryError('METHOD_NOT_ALLOWED',405);
   if((session||exercise)&&url.search)throw new DiscoveryError('INVALID_FILTER');
   if(player&&(req.method!=='GET'||[...url.searchParams.keys()].some(k=>!['session','set','item'].includes(k))||url.searchParams.has('session')&&!uuid.test(url.searchParams.get('session'))||url.searchParams.has('set')&&!uuid.test(url.searchParams.get('set'))||url.searchParams.has('item')&&!/^(?:[0-9]|1[0-9])$/.test(url.searchParams.get('item'))))throw new DiscoveryError('INVALID_SESSION');
   let body;
   if(req.method==='POST'){
    if(req.headers.origin!==origin)throw new DiscoveryError('ORIGIN_REJECTED',403);
    const chunks=[];let length=0;
    try{for await(const chunk of req.iterator({destroyOnReturn:false})){length+=chunk.length;if(length>(draft?100000:8192))throw new DiscoveryError('BODY_TOO_LARGE',413);chunks.push(chunk);}}
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
    try{const value=JSON.parse(data),sessionId=value.session?.id??value.sessionId,secure=origin.startsWith('https:')?'; Secure':'';
     if(uuid.test(sessionId??''))cookies.push('discovery_recent='+sessionId+'; HttpOnly; SameSite=Strict; Path=/api/sessions; Max-Age=2592000'+secure);
     if(uuid.test(value.set?.id??''))cookies.push('discovery_recent_set='+value.set.id+'; HttpOnly; SameSite=Strict; Path=/api/sessions; Max-Age=2592000'+secure);
    }catch{}
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
