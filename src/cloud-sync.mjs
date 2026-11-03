/* Brandicade cloud-save bridge: opt-in, conflict-conservative, local-first.
 * This is a protected release candidate, not a background sync service.
 * Only Glimmer Pop's original SAVE_KEY participates; Prism Garden is separate.
 */
import {SAVE_KEY,sanitizeSave,exportSave} from './progression.mjs';

const MAX_REVISION=10000000;
function decode(raw){
 if(raw===null)return null;
 if(typeof raw!=='string'||raw.length>512000)throw Error('Local backup is unreadable.');
 let value;try{value=JSON.parse(raw)}catch{throw Error('Local backup is unreadable.')}
 return sanitizeSave(value);
}
function checkedRevision(value){
 if(!Number.isSafeInteger(value)||value<0||value>MAX_REVISION)
   throw Error('Cloud response is invalid.');
 return value;
}
export function planCloudSync(localRaw,cloud){
 if(!cloud||typeof cloud!=='object'||Array.isArray(cloud))
   throw Error('Cloud response is invalid.');
 const revision=checkedRevision(cloud.revision);
 if(cloud.save!==null&&(!cloud.save||typeof cloud.save!=='object'||Array.isArray(cloud.save)))
   throw Error('Cloud response is invalid.');
 const local=decode(localRaw);
 const remote=cloud.save===null?null:sanitizeSave(cloud.save);
 if(revision===0&&remote!==null)throw Error('Cloud response is invalid.');
 const equal=local&&remote&&JSON.stringify(local)===JSON.stringify(remote);
 const kind=local&&remote?(equal?'equal':'conflict'):
  local?'upload':remote?'restore':'empty';
 return Object.freeze({kind,revision,local,remote});
}

async function jsonGet(path){
 const response=await fetch(path,{credentials:'same-origin',cache:'no-store'});
 if(!response.ok)throw Error('Cloud service unavailable.');
 return response.json();
}
function saveFile(contents,filename){
 const blob=new Blob([contents],{type:'application/json'});
 const href=URL.createObjectURL(blob);
 const link=document.createElement('a');
 link.href=href;link.download=filename;link.hidden=true;
 document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(href),1000);
}

export function mountCloudSync(){
 const host=document.querySelector('#profile .data-panel');
 if(!host||host.querySelector('[data-cloud-bridge]'))return;
 const panel=document.createElement('section');
 panel.dataset.cloudBridge='';
 panel.className='brandicade-cloud-bridge';
 panel.innerHTML=
  '<div class="brandicade-cloud-head"><strong>CLOUD BACKUP</strong><span>Manual · Glimmer Pop only</span></div>'+
  '<p class="brandicade-cloud-status" role="status" aria-live="polite">Device progress stays here until you choose to sync. Prism Garden saves separately.</p>'+
  '<div class="brandicade-cloud-controls">'+
  '<button type="button" data-cloud-action="check">Check cloud backup</button>'+
  '<button type="button" data-cloud-action="local" hidden>Download device backup</button>'+
  '<button type="button" data-cloud-action="remote" hidden>Download cloud backup</button>'+ 
  '<button type="button" data-cloud-action="confirm-backup" hidden>I saved the backup file</button>'+
  '<button type="button" data-cloud-action="upload" hidden>Upload device save</button>'+
  '<button type="button" data-cloud-action="restore" hidden>Restore cloud save</button></div>';
 const css=document.createElement('style');
 css.textContent=
  '.brandicade-cloud-bridge{margin-top:18px;padding:17px;border:1px solid #9ebd9b65;border-radius:19px;background:linear-gradient(135deg,#163c35,#102c30);box-shadow:inset 0 1px #ffffff15}'+
  '.brandicade-cloud-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;color:#f5d9ab;font:800 11px system-ui;letter-spacing:.12em}'+
  '.brandicade-cloud-head span{font-weight:500;color:#d1ddd1;letter-spacing:0}'+
  '.brandicade-cloud-status{color:#e3eee2;font:500 13px/1.5 system-ui;margin:12px 0}'+
  '.brandicade-cloud-controls{display:flex;flex-wrap:wrap;gap:9px}'+
  '.brandicade-cloud-controls button{font:700 12px/1.25 system-ui;background:#365d4c;color:#f8f2e6;border:1px solid #a7cbb383;border-radius:11px;min-height:44px;padding:11px 13px;touch-action:manipulation}'+
  '.brandicade-cloud-controls button:focus-visible{outline:3px solid #f4dfb7;outline-offset:3px}'+
  '.brandicade-cloud-controls button[hidden]{display:none}';
 document.head.append(css);host.append(panel);
 const status=panel.querySelector('.brandicade-cloud-status');
 const buttons=Object.fromEntries([...panel.querySelectorAll('[data-cloud-action]')]
  .map(b=>[b.dataset.cloudAction,b]));
 let state=null,localSnapshot=null,deviceBackupVerified=false,remoteBackupVerified=false,pendingBackup=null,busy=false;
 function say(message){status.textContent=message}
 function show(...names){
  for(const [action,button] of Object.entries(buttons))
    button.hidden=action!=='check'&&!names.includes(action);
 }
 function unchanged(){
  try{return globalThis.localStorage.getItem(SAVE_KEY)===localSnapshot}
  catch{return false}
 }
 async function check(){
  state=null;deviceBackupVerified=false;remoteBackupVerified=false;pendingBackup=null;
  show();say('Checking encrypted connection and save revision…');
  let raw;
  try{raw=globalThis.localStorage.getItem(SAVE_KEY)}
  catch{say('Device storage cannot be read. No changes were made.');return}
  try{
   const session=await jsonGet('/api/session');
   if(session?.role!=='player'){
    say('Only the player can view cloud saves. Your local arcade is unchanged.');
    return;
   }
   const cloud=await jsonGet('/api/save');
   state=planCloudSync(raw,cloud);localSnapshot=raw;
   if(state.kind==='upload'){
    show('local');
    say('Device-only progress found. Download a backup before enabling the first cloud upload.');
   }else if(state.kind==='restore'){
    show('remote');
    say('Cloud progress exists but this browser has no device save. Download a cloud backup before restoring.');
   }else if(state.kind==='conflict'){
    show('local','remote');
    say('Device and cloud saves differ. Neither will be replaced automatically. Download both backups and resolve the conflict before syncing.');
   }else if(state.kind==='equal'){
    show('local','remote');
    say('Device and cloud copies match. Changes after this check still require a new manual sync.');
   }else{
    say('No cloud or device save found. Start playing; progress remains on this device.');
   }
  }catch{
   state=null;say('Cloud unavailable or save cannot be validated. Your device progress is unchanged.');
  }
 }
 async function upload(){
  if(state?.kind!=='upload'||!deviceBackupVerified||!unchanged()){
   say('Save changed or backup not confirmed. Check cloud again; no data was uploaded.');return;
  }
  try{
   const response=await fetch('/api/save',{
    method:'PUT',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({baseRevision:state.revision,save:state.local})
   });
   if(response.status===409){
    state=null;show();
    say('Cloud revision changed. No device data was overwritten. Check cloud again.');
    return;
   }
   if(!response.ok)throw Error('save unavailable');
   const result=await response.json();
   if(result?.ok!==true||result.revision!==state.revision+1)
     throw Error('Unexpected cloud revision');
   state=null;show();
   say('Cloud backup saved at revision '+result.revision+'. Device progress is unchanged.');
  }catch{
   state=null;show();
   say('Cloud write could not be confirmed. Check cloud status before trying again; device progress is unchanged.');
  }
 }
 function restore(){
  if(state?.kind!=='restore'||!remoteBackupVerified||!unchanged()||localSnapshot!==null){
   say('A device save appeared or backup is not confirmed. No restore occurred.');return;
  }
  try{
   globalThis.localStorage.setItem(SAVE_KEY,JSON.stringify(state.remote));
   state=null;
   say('Cloud save restored on this device. Refreshing the arcade…');
   location.reload();
  }catch{say('Device storage write failed. The cloud save remains unchanged.')}
 }
 panel.addEventListener('click',async event=>{
  const button=event.target.closest('[data-cloud-action]');
  if(!button||busy||button.hidden)return;
  const action=button.dataset.cloudAction;
  busy=true;button.disabled=true;
  try{
   if(action==='check')await check();
   else if(action==='local'&&state?.local){
    saveFile(exportSave(state.local),'brandicade-device-backup.json');
    pendingBackup='local';deviceBackupVerified=false;
    show('local','confirm-backup');
    say('Device backup download started. Save it in Files, then confirm before any upload.');
   }else if(action==='remote'&&state?.remote){
    saveFile(exportSave(state.remote),'brandicade-cloud-backup.json');
    pendingBackup='remote';remoteBackupVerified=false;
    show('remote','confirm-backup');
    say('Cloud backup download started. Save it in Files, then confirm before any restore.');
   }else if(action==='confirm-backup'&&pendingBackup&&state){
    if(!unchanged()){
     state=null;pendingBackup=null;show();
     say('Device save changed. Check cloud again before proceeding.');return;
    }
    if(pendingBackup==='local'){
     deviceBackupVerified=true;
     show('local',...(state.kind==='conflict'||state.kind==='equal'?['remote']:[]),...(state.kind==='upload'?['upload']:[]));
     say('Backup file acknowledged. You may now choose to upload. No data has changed.');
    }else{
     remoteBackupVerified=true;
     show('remote',...(state.kind==='conflict'||state.kind==='equal'?['local']:[]),...(state.kind==='restore'?['restore']:[]));
     say('Backup file acknowledged. You may now choose to restore. No data has changed.');
    }
    pendingBackup=null;
   }else if(action==='upload')await upload();
   else if(action==='restore')restore();
  }finally{busy=false;button.disabled=false}
 });
}
if(typeof document!=='undefined'){
 if(document.readyState==='loading')
  document.addEventListener('DOMContentLoaded',mountCloudSync,{once:true});
 else mountCloudSync();
}
