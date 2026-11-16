import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';import {randomBytes,timingSafeEqual,createHmac} from 'node:crypto';import {join} from 'node:path';
const equal=(a,b)=>{const x=Buffer.from(a??''),y=Buffer.from(b??'');return x.length===y.length&&timingSafeEqual(x,y);};
export function createOperatorAuth(directory='/secrets'){
 mkdirSync(directory,{recursive:true,mode:0o700});const path=join(directory,'operator-key');
 try{writeFileSync(path,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
 const key=readFileSync(path,'utf8').trim();if(!/^[a-f0-9]{64}$/.test(key))throw Error('INVALID_OPERATOR_KEY_FILE');
 const sign=value=>createHmac('sha256',key).update(value).digest('hex');
 return {basic(request){try{return equal(Buffer.from((request.headers.authorization??'').replace(/^Basic /,''),'base64').toString(),'operator:'+key);}catch{return false;}},
 password:value=>equal(value,key),
 cookie(){const data=Date.now()+'.'+randomBytes(16).toString('hex');return data+'.'+sign(data);},
 authenticated(request){const value=(request.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith('verification_operator='))?.slice('verification_operator='.length);
 if(!value)return false;const parts=value.split('.');return parts.length===3&&Number(parts[0])<=Date.now()&&Date.now()-Number(parts[0])<8*3600000&&equal(parts[2],sign(parts.slice(0,2).join('.')));}};
}
