/** Read-only check of exported Glimmer Pop files. Never reads or writes browser storage. */
import {importSave} from './progression.mjs';

/**
 * Older Glimmer Pop exports have no authenticated checksum. This verifies
 * recognized format and *lossless* compatibility with the current reader,
 * not authorship, freshness, or cryptographic integrity.
 */
export function checkGlimmerBackup(text){
 if(typeof text!=='string'||text.length>512000)
  throw Error('Choose a Glimmer Pop export smaller than 500KB.');
 let envelope;
 try{envelope=JSON.parse(text);}catch{throw Error('The selected file is not valid JSON.');}
 if(!envelope||typeof envelope!=='object'||Array.isArray(envelope)||
    envelope.format!=='BRANDICADE_BACKUP'||!envelope.data||
    typeof envelope.data!=='object'||Array.isArray(envelope.data))
  throw Error('This is not a supported Glimmer Pop backup.');
 const restored=importSave(text);
 // A permissive save sanitizer can fill missing fields or remove unknown ones.
 // Never call such a file "verified" when restoring would silently lose data.
 if(JSON.stringify(envelope.data)!==JSON.stringify(restored))
  throw Error('This file would lose or alter save details during import. Nothing was restored.');
 return Object.freeze({
  gamesPlayed:restored.stats.played,
  completedLevels:Object.keys(restored.progression.levels).length,
  mode:'read-only-format-and-lossless-compatibility',
  cryptographicIntegrityVerified:false,
 });
}
