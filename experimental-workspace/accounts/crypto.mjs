import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes} from 'node:crypto';
export const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export function createVault(secret){
 if(typeof secret!=='string'||!/^[a-f0-9]{64}$/.test(secret))throw Error('ACCOUNT_KEY_REQUIRED');
 const key=Buffer.from(secret,'hex');
 return {
  ownerToken:accountId=>createHmac('sha256',key).update('mathpractice-owner-v1\0'+accountId).digest('base64url'),
  seal(value,aad){
   const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(Buffer.from(aad));
   const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
   return 'v1.'+Buffer.concat([nonce,cipher.getAuthTag(),data]).toString('base64url');
  },
  open(value,aad){
   if(typeof value!=='string'||!value.startsWith('v1.'))throw Error('ACCOUNT_DATA_UNAVAILABLE');
   try{const bytes=Buffer.from(value.slice(3),'base64url'),decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAAD(Buffer.from(aad));decipher.setAuthTag(bytes.subarray(12,28));return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8'));}
   catch{throw Error('ACCOUNT_DATA_UNAVAILABLE');}
  }
 };
}
