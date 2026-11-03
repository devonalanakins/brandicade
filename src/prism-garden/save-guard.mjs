/**
 * Prism Garden local save integrity validation.
 * Pure and dependency-free; the caller supplies its existing level catalog and reducer.
 * This checks local progress integrity, not identity or cryptographic authenticity.
 */
const MAX_MOVES=80;
const isCount=(value,upper=100000)=>Number.isSafeInteger(value)&&value>=0&&value<=upper;
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

function gemInventory(level){
 const expected=new Map();
 for(let si=0;si<level.stacks.length;si++){
  for(let depth=0;depth<level.stacks[si].length;depth++)expected.set(si+'-'+depth,level.stacks[si][depth]);
 }
 return expected;
}
const signature=board=>JSON.stringify([board.stacks,board.shelf,board.placed,board.moves,board.finished]);
function boardIsWellFormed(level,board,expected){
 if(!isObject(board)||!Array.isArray(board.stacks)||!Array.isArray(board.shelf)||
    !Array.isArray(board.placed)||!isCount(board.moves,MAX_MOVES)||typeof board.finished!=='boolean')return false;
 if(board.stacks.length!==level.stacks.length||board.shelf.length!==level.shelfCapacity||
    board.placed.length!==level.colors.length*3)return false;
 const seen=new Set();
 const inspectGem=gem=>{
  if(!isObject(gem)||typeof gem.id!=='string'||typeof gem.color!=='string')return false;
  if(!expected.has(gem.id)||expected.get(gem.id)!==gem.color||seen.has(gem.id))return false;
  seen.add(gem.id);return true;
 };
 for(let i=0;i<board.stacks.length;i++){
  const stack=board.stacks[i];
  if(!Array.isArray(stack)||stack.length>level.stacks[i].length)return false;
  const removed=level.stacks[i].length-stack.length;
  for(let j=0;j<stack.length;j++)if(!inspectGem(stack[j])||stack[j].id!==i+'-'+(removed+j))return false;
 }
 for(const gem of board.shelf)if(gem!==null&&!inspectGem(gem))return false;
 let unfinished=false;
 for(let region=0;region<level.colors.length;region++){
  let complete=true,nonempty=false;
  for(let j=region*3;j<region*3+3;j++){
   const gem=board.placed[j];
   if(gem===null){complete=false;continue;}
   if(!inspectGem(gem)||gem.color!==level.colors[region])return false;
   nonempty=true;
  }
  if(unfinished&&nonempty)return false;
  if(!complete)unfinished=true;
 }
 if(seen.size!==expected.size)return false;
 return board.finished===(board.placed.every(Boolean)&&board.stacks.every(s=>!s.length)&&board.shelf.every(g=>g===null));
}
export function validateSavedRun(run,{levelById,createRun,validDestinations,tryMove}){
 if(!isObject(run)||run.schema!==1||typeof run.levelId!=='string'||typeof run.runId!=='string'||
    run.runId.length<1||run.runId.length>128||!['sanctuary','mastery'].includes(run.mode)||
    !isCount(run.undos)||!isCount(run.hints)||!isCount(run.maxShelf,4)||!Array.isArray(run.history)||
    run.history.length>MAX_MOVES||run.history.length!==run.moves)return false;
 const level=levelById(run.levelId);
 if(!level||level.version!==1||!Array.isArray(level.stacks)||run.maxShelf>level.shelfCapacity)return false;
 const expected=gemInventory(level);
 if(!boardIsWellFormed(level,run,expected)||run.maxShelf<run.shelf.filter(Boolean).length)return false;
 if(run.history.some((h,i)=>!boardIsWellFormed(level,h,expected)||h.moves!==i))return false;
 let state=createRun(level,{runId:run.runId,mode:run.mode});
 const chain=[...run.history,run];
 for(let step=0;step<run.moves;step++){
  if(signature(state)!==signature(chain[step]))return false;
  let next=null;
  const sources=[
   ...state.stacks.map((stack,index)=>stack.length?{kind:'stack',index}:null),
   ...state.shelf.map((gem,index)=>gem?{kind:'shelf',index}:null)
  ].filter(Boolean);
  search:for(const source of sources){
   for(const target of validDestinations(level,state,source)){
    const outcome=tryMove(level,state,source,target);
    if(outcome.ok&&signature(outcome.run)===signature(chain[step+1])){
     next=outcome.run;break search;
    }
   }
  }
  if(!next)return false;
  state=next;
 }
 return signature(state)===signature(run);
}
/** Refuse invalid active runs before replacing current progress. */
export function sanitizeImportedProgress(input,deps){
 const {validateProgress,...game}=deps;
 const validated=validateProgress(input);
 if(input.active!=null&&(!validated.active||!validateSavedRun(validated.active,game)))
  throw Error('The saved game has an inconsistent move history or jewel inventory. The original data was not changed.');
 return validated;
}
