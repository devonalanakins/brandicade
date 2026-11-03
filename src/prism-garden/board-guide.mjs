/* Board guidance is a derived view of the deterministic puzzle, never persisted. */
import {GEMS} from './content.mjs';
import {activeRegion,selectedGem,validDestinations} from './engine.mjs';

/** Keep the player oriented without granting hints, medals or false progress. */
export function describeBoard(level,run,selection=null) {
 const active=activeRegion(run,level);
 const regions=level.colors.map((color,index)=>{
  const filled=run.placed.slice(index*3,index*3+3).filter(Boolean).length;
  const status=filled===3?'restored':index===active?'active':'locked';
  return {index,color,name:GEMS[color].label,filled,total:3,status};
 });
 const picked=selection?selectedGem(run,selection):null;
 const destinations=picked?validDestinations(level,run,selection):[];
 const current=regions.find(region=>region.status==='active')||null;
 let instruction;
 if(run.finished)instruction='Mosaic restored. Your world is ready.';
 else if(picked) {
  const count=destinations.length;
  instruction=count?
   GEMS[picked.color].label+' jewel selected. '+count+' available '+(count===1?'destination':'destinations')+'. Tap a highlighted socket or shelf slot.':
   GEMS[picked.color].label+' jewel selected, but no legal destination is open. Choose a different jewel or undo a move.';
 }else {
  instruction=current?
   'Choose an exposed jewel, then tap a highlighted destination for '+current.name+' jewels.':
   'The mosaic is complete.';
 }
 return {
  regions,current,selection:picked?{kind:selection.kind,index:selection.index,color:picked.color,name:GEMS[picked.color].label}:null,
  destinations,instruction,
  placed:run.placed.filter(Boolean).length,total:run.placed.length
 };
}
