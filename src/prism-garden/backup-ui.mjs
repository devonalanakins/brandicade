/** Accessible device-local backups, mounted in Prism Garden's existing Settings screen. */
import {levelById} from './content.mjs';
import {createRun,validDestinations,tryMove} from './engine.mjs';
import {validateProgress,readStoredProgress,KEY} from './achievements.mjs';
import {sanitizeImportedProgress} from './save-guard.mjs';
import {makeBackup,parseBackup,writeDownload,MAX_BACKUP_BYTES} from './backup.mjs';
const dependencies={levelById,createRun,validDestinations,tryMove,validateProgress};
const host=document.getElementById('prism-app');
function notify(message,kind='info'){
 const status=document.getElementById('pg-backup-status');
 if(status){status.textContent=message;status.dataset.kind=kind;}
}
function readCurrent(){
 const raw=localStorage.getItem(KEY);
 if(!raw)throw Error('No Prism Garden progress has been saved on this device yet.');
 let value;
 try{value=JSON.parse(raw);}catch{throw Error('Local progress cannot be read. Original data remains untouched.');}
 return sanitizeImportedProgress(value,dependencies);
}
async function exportCurrent(){
 const progress=readCurrent(),contents=await makeBackup(progress);
 writeDownload(contents);
 notify('Backup downloaded. Keep the file somewhere private and safe.','success');
}
async function exportUnreadable(){
 const raw=localStorage.getItem(KEY);
 if(typeof raw!=='string')throw Error('No saved data is available to export.');
 writeDownload(raw,'prism-garden-unverified-original-'+new Date().toISOString().slice(0,10)+'.txt');
 notify('Original data downloaded as-is. This is not a verified backup; retain it privately for recovery.','success');
}
async function importSelected(input){
 const file=input.files?.[0];input.value='';
 if(!file)return;
 if(file.size>MAX_BACKUP_BYTES)throw Error('The selected file exceeds the supported backup size.');
 const incoming=await parseBackup(await file.text(),dependencies);
 if(!window.confirm('Replace ONLY Prism Garden progress on this device with this backup? Glimmer Pop and Brandle will not be changed.')){
  notify('Import cancelled. Nothing changed.');return;
 }
 // A single namespaced write; original arcade and Brandle data is not touched.
 localStorage.setItem(KEY,JSON.stringify(incoming));
 notify('Backup restored. Reloading Prism Garden.','success');
 window.location.reload();
}
function mount(){
 if(!host||host.querySelector('#pg-backup-tools'))return;
 const settings=host.querySelector('.pg-options');
 if(!settings)return;
 const recovery=readStoredProgress();
 const hasUnreadableOriginal=recovery.recoveryRequired&&typeof recovery.raw==='string';
 const panel=document.createElement('section');
 panel.id='pg-backup-tools';panel.className='pg-backup-panel';
 panel.setAttribute('aria-labelledby','pg-backup-title');
 panel.innerHTML='<div class="pg-backup-heading"><span class="pg-backup-symbol" aria-hidden="true">◇</span>'+
  '<div><h2 id="pg-backup-title">Protect your garden</h2>'+
  '<p>Download or restore a private, device-local progress backup.</p></div></div>'+
  '<div class="pg-backup-buttons"><button type="button" id="pg-backup-export">Download backup</button>'+
  '<label for="pg-backup-import">Restore from file</label>'+
  '<input id="pg-backup-import" type="file" accept=".json,application/json" aria-label="Select Prism Garden backup file"></div>'+
  (hasUnreadableOriginal?'<button type="button" id="pg-backup-raw">Download original unreadable save</button>':'')+
  (recovery.recoveryRequired&&!hasUnreadableOriginal?'<p class="pg-backup-storage-note">Browser storage is unavailable. Allow site storage before restoring a backup.</p>':'')+
  '<p id="pg-backup-status" role="status" aria-live="polite">'+
  'Backups include achievements, completed levels and your current puzzle. '+
  'They remain on your device unless you choose to share the file.</p>';
 settings.after(panel);
 panel.querySelector('#pg-backup-export').addEventListener('click',async event=>{
  const button=event.currentTarget;button.disabled=true;
  try{await exportCurrent();}catch(error){notify(error?.message||'Backup could not be created.','error');}
  finally{button.disabled=false;}
 });
 if(hasUnreadableOriginal)panel.querySelector('#pg-backup-raw').addEventListener('click',async event=>{
  const button=event.currentTarget;button.disabled=true;
  try{await exportUnreadable();}catch(error){notify(error?.message||'Original save export failed.','error');}
  finally{button.disabled=false;}
 });
 panel.querySelector('#pg-backup-import').addEventListener('change',async event=>{
  try{await importSelected(event.currentTarget);}catch(error){notify(error?.message||'Could not read backup. Nothing changed.','error');}
 });
}
if(host){
 const observer=new MutationObserver(mount);
 observer.observe(host,{childList:true,subtree:true});
 mount();
}
