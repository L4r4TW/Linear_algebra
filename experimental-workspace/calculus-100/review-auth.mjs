export function protectReview({auth,app,seed}){
 const cookie='verification_review_owner_'+seed;
 const rewrite=value=>Array.isArray(value)?value.map(rewrite):String(value).replace(/^la_experiment_owner=/,cookie+'=');
 return (req,res)=>{
  if(!auth.basic(req)){res.writeHead(401,{'WWW-Authenticate':'Basic realm="Calculus review"','Cache-Control':'no-store'});res.end('Operator credentials required');return;}
  req.headers.cookie=(req.headers.cookie??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(cookie+'=')).map(s=>s.replace(cookie+'=','la_experiment_owner=')).join('; ');
  const write=res.writeHead.bind(res);res.writeHead=(status,headers)=>{if(headers)for(const key of Object.keys(headers))if(key.toLowerCase()==='set-cookie')headers[key]=rewrite(headers[key]);return write(status,headers);};
  const set=res.setHeader.bind(res);res.setHeader=(key,value)=>set(key,key.toLowerCase()==='set-cookie'?rewrite(value):value);
  app.emit('request',req,res);
 };
}
