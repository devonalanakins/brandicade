import {LEVELS} from './content.mjs';
export const ACHIEVEMENTS = Object.freeze([
 {id:'PG-ACH-001',name:'First Spark',description:'Complete your first Prism Garden puzzle.',icon:'✦',kind:'discovery'},
 {id:'PG-ACH-002',name:'Petal Collector',description:'Complete five unique mosaics.',icon:'❀',kind:'collection'},
 {id:'PG-ACH-003',name:'Gallery Keeper',description:'Collect twelve unique mosaics.',icon:'◇',kind:'collection'},
 {id:'PG-ACH-004',name:'Perfect Placement',description:'Complete a board without undo or hints.',icon:'✧',kind:'mastery'},
 {id:'PG-ACH-005',name:'Crystal Clear',description:'Earn a Mastery gold medal.',icon:'◈',kind:'mastery'},
 {id:'PG-ACH-006',name:'Calm Current',description:'Complete five different boards in Sanctuary.',icon:'≈',kind:'sanctuary'},
 {id:'PG-ACH-007',name:'Shelf Savant',description:'Finish a board without filling every shelf slot.',icon:'⬡',kind:'strategy'},
 {id:'PG-ACH-008',name:'Thoughtful Return',description:'Use undo and then complete that board.',icon:'↶',kind:'discovery'},
 {id:'PG-ACH-009',name:'Twin Light',description:'Complete two color regions on a single board.',icon:'✳',kind:'discovery'},
 {id:'PG-ACH-010',name:'The Garden Wakes',description:'Restore Dewglass Conservatory.',icon:'❃',kind:'world'},
 {id:'PG-ACH-011',name:'Ember Heart',description:'Restore Ember Orchard.',icon:'✺',kind:'world'},
 {id:'PG-ACH-012',name:'Moonwater',description:'Restore Moonpool Atrium.',icon:'☾',kind:'world'},
 {id:'PG-ACH-013',name:'The Curator',description:'Collect all eighteen mosaics.',icon:'❖',kind:'collection'},
 {id:'PG-ACH-014',name:'Second Bloom',description:'Replay a completed puzzle and finish again.',icon:'↺',kind:'discovery'},
 {id:'PG-ACH-015',name:'Hidden Glimmer',description:'Find the hidden light in a finished scene.',icon:'✴',kind:'secret'},
 {id:'PG-ACH-016',name:'Radiant Suite',description:'Earn gold Mastery medals in all three worlds.',icon:'✶',kind:'mastery'},
 {id:'PG-ACH-017',name:'Spectrum Seeker',description:'Finish a board from all three worlds.',icon:'◆',kind:'exploration'},
 {id:'PG-ACH-018',name:'Night Gardener',description:'Visit a finished world with moonlight enabled.',icon:'☽',kind:'secret'}
]);
export const KEY='brandicade:prism-garden:v1';
const store=()=>({version:1,completed:{},mastery:{},sanctuary:[],awards:{},settings:{motion:'system',sound:true,colorAssist:true,night:false},active:null});
export const newProgress=()=>store();
export function validateProgress(value) {
  if(!value||value.version!==1||typeof value!=='object'||Array.isArray(value))throw Error('Unrecognized save data');
  const validIDs=new Set(LEVELS.map(l=>l.id));
  const out=store();
  const completed=value.completed&&typeof value.completed==='object'?value.completed:{};
  for(const [id,date] of Object.entries(completed))if(validIDs.has(id)&&typeof date==='string'&&date.length<60)out.completed[id]=date;
  const mastery=value.mastery&&typeof value.mastery==='object'?value.mastery:{};
  for(const [id,medal] of Object.entries(mastery))if(validIDs.has(id)&&['bronze','silver','gold'].includes(medal))out.mastery[id]=medal;
  out.sanctuary=Array.isArray(value.sanctuary)?[...new Set(value.sanctuary.filter(id=>validIDs.has(id)))]:[];
  for(const achievement of ACHIEVEMENTS)if(typeof value.awards?.[achievement.id]==='string')out.awards[achievement.id]=value.awards[achievement.id];
  const settings=value.settings||{};
  out.settings={motion:['system','on','off'].includes(settings.motion)?settings.motion:'system',sound:settings.sound!==false,colorAssist:settings.colorAssist!==false,night:!!settings.night};
  const candidate=value.active;
  if(candidate&&validIDs.has(candidate.levelId)&&candidate.schema===1&&Array.isArray(candidate.stacks)&&Array.isArray(candidate.shelf)&&Array.isArray(candidate.placed)&&Array.isArray(candidate.history)&&candidate.history.length<500&&candidate.stacks.length===3&&candidate.shelf.length<=4&&candidate.placed.length<=15)out.active=candidate;
  return out;
}
export function loadProgress(storage=globalThis.localStorage) {
  try {const raw=storage.getItem(KEY);return raw?validateProgress(JSON.parse(raw)):store();}
  catch{return store();}
}
export function persistProgress(progress,storage=globalThis.localStorage) {
  try {storage.setItem(KEY,JSON.stringify(progress));return true;}catch{return false;}
}
export function earned(progress,id,date=new Date().toISOString()) {
  if(!progress.awards[id]){progress.awards[id]=date;return true;}return false;
}
const unique=(progress)=>Object.keys(progress.completed).length;
const chapterDone=(progress,start)=>LEVELS.slice(start,start+6).every(l=>progress.completed[l.id]);
export function evaluateAchievements(progress,run,{replay=false}={}) {
  const count=unique(progress),newly=[];
  const award=(id,yes)=>{if(yes&&earned(progress,id))newly.push(ACHIEVEMENTS.find(a=>a.id===id));};
  const goldWorlds=new Set(Object.keys(progress.mastery).filter(id=>progress.mastery[id]==='gold').map(id=>LEVELS.find(l=>l.id===id)?.world));
  award('PG-ACH-001',count>=1);
  award('PG-ACH-002',count>=5);
  award('PG-ACH-003',count>=12);
  award('PG-ACH-004',run.undos===0&&run.hints===0);
  award('PG-ACH-005',progress.mastery[run.levelId]==='gold');
  award('PG-ACH-006',progress.sanctuary.length>=5);
  award('PG-ACH-007',run.maxShelf<run.shelf.length);
  award('PG-ACH-008',run.undos>0);
  award('PG-ACH-009',run.placed.length>=6);
  award('PG-ACH-010',chapterDone(progress,0));
  award('PG-ACH-011',chapterDone(progress,6));
  award('PG-ACH-012',chapterDone(progress,12));
  award('PG-ACH-013',count===18);
  award('PG-ACH-014',replay);
  award('PG-ACH-016',goldWorlds.size===3);
  award('PG-ACH-017',new Set(Object.keys(progress.completed).map(id=>LEVELS.find(l=>l.id===id)?.world)).size===3);
  return newly;
}
