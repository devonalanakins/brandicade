/** Local-only portable backups; no network transmission or old-game migration. */
import {sanitizeImportedProgress} from './save-guard.mjs';
const FORMAT='brandicade.prism-garden.backup';
const VERSION=1;
export const MAX_BACKUP_BYTES=256*1024;
const encoder=new TextEncoder();
const hex=bytes=>[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');
async function checksum(bytes,cryptoObject=globalThis.crypto){
 if(!cryptoObject?.subtle)throw Error('Secure backup checksums are unavailable on this device.');
 return hex(new Uint8Array(await cryptoObject.subtle.digest('SHA-256',bytes)));
}
export async function makeBackup(progress,cryptoObject=globalThis.crypto){
 const payload=JSON.stringify(progress);
 const bytes=encoder.encode(payload);
 if(bytes.length>MAX_BACKUP_BYTES)throw Error('Progress is too large for a single local backup.');
 const digest=await checksum(bytes,cryptoObject);
 const contents=JSON.stringify({format:FORMAT,version:VERSION,createdAt:new Date().toISOString(),
  integrity:{algorithm:'SHA-256',digest},progress});
 if(encoder.encode(contents).length>MAX_BACKUP_BYTES)throw Error('The completed backup exceeds the supported file size.');
 return contents;
}
export async function parseBackup(contents,deps,cryptoObject=globalThis.crypto){
 if(typeof contents!=='string'||encoder.encode(contents).length>MAX_BACKUP_BYTES)
  throw Error('That file is not a supported Prism Garden backup.');
 let envelope;
 try{envelope=JSON.parse(contents);}catch{throw Error('The backup is not valid JSON.');}
 if(!envelope||envelope.format!==FORMAT||envelope.version!==VERSION||
    envelope.integrity?.algorithm!=='SHA-256'||
    !/^[a-f0-9]{64}$/.test(envelope.integrity?.digest||'')||
    !envelope.progress||typeof envelope.progress!=='object')
  throw Error('The backup format or version is not supported.');
 const actual=await checksum(encoder.encode(JSON.stringify(envelope.progress)),cryptoObject);
 if(actual!==envelope.integrity.digest)throw Error('This backup failed its integrity check. The saved game was not replaced.');
 return sanitizeImportedProgress(envelope.progress,deps);
}
export function backupFilename(date=new Date()){return 'prism-garden-backup-'+date.toISOString().slice(0,10)+'.json';}
export function writeDownload(contents,filename=backupFilename(),doc=document,urlApi=URL){
 const blob=new Blob([contents],{type:'application/json'});
 const url=urlApi.createObjectURL(blob);
 const anchor=doc.createElement('a');
 anchor.href=url;anchor.download=filename;anchor.hidden=true;
 doc.body.appendChild(anchor);
 try{anchor.click();}finally{anchor.remove();setTimeout(()=>urlApi.revokeObjectURL(url),1000);}
}
