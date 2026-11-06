/* Pure, deterministic Prism Garden sorting engine. No browser or network APIs. */
import {LEVELS} from './content.mjs';
const copy=(a)=>a.map((value)=>Array.isArray(value)?value.slice():value);
const validIndex=(n,length)=>Number.isInteger(n)&&n>=0&&n<length;
export function createRun(level=LEVELS[0], options={}) {
  if(!level||!LEVELS.some((l)=>l.id===level.id))throw Error('Unknown level');
  return {
    schema:1,levelId:level.id,runId:String(options.runId||('preview-'+level.id)),
    mode:options.mode==='mastery'?'mastery':'sanctuary',
    stacks:level.stacks.map((stack,si)=>stack.map((color,depth)=>({id:si+'-'+depth,color}))),
    shelf:Array(level.shelfCapacity).fill(null),
    placed:Array(level.colors.length*3).fill(null),
    moves:0,undos:0,hints:0,maxShelf:0,history:[],finished:false
  };
}
export function activeRegion(run,level) {
  for(let region=0;region<level.colors.length;region++) {
    if(run.placed.slice(region*3,region*3+3).some((v)=>v===null))return region;
  }
  return level.colors.length;
}
export function selectedGem(run,source) {
  if(!source||!Number.isInteger(source.index))return null;
  if(source.kind==='stack'&&validIndex(source.index,run.stacks.length))return run.stacks[source.index][0]||null;
  if(source.kind==='shelf'&&validIndex(source.index,run.shelf.length))return run.shelf[source.index]||null;
  return null;
}
export function validDestinations(level,run,source) {
  if(run.finished)return [];
  const gem=selectedGem(run,source);
  if(!gem)return [];
  const destinations=[];
  const region=activeRegion(run,level);
  if(region<level.colors.length&&gem.color===level.colors[region]) {
    for(let i=region*3;i<region*3+3;i++)if(run.placed[i]===null)destinations.push({kind:'socket',index:i});
  }
  if(source.kind==='stack')for(let i=0;i<run.shelf.length;i++)if(run.shelf[i]===null)destinations.push({kind:'shelf',index:i});
  return destinations;
}
export function tryMove(level,run,source,target) {
  if(!target||!Number.isInteger(target.index))return {ok:false,reason:'invalid target',run};
  if(!validDestinations(level,run,source).some((d)=>d.kind===target.kind&&d.index===target.index))return {ok:false,reason:'Not a legal move',run};
  const stacks=copy(run.stacks),shelf=run.shelf.slice(),placed=run.placed.slice();
  const gem=source.kind==='stack'?stacks[source.index].shift():shelf[source.index];
  if(source.kind==='shelf')shelf[source.index]=null;
  if(target.kind==='shelf')shelf[target.index]=gem;
  else placed[target.index]=gem;
  const history=run.history.concat([{
    stacks:run.stacks,shelf:run.shelf,placed:run.placed,moves:run.moves,
    maxShelf:run.maxShelf,finished:run.finished
  }]);
  const completed=placed.every((g)=>g!==null)&&stacks.every((s)=>s.length===0)&&shelf.every((g)=>g===null);
  return {ok:true,run:{
    ...run,stacks,shelf,placed,history,moves:run.moves+1,finished:completed,
    maxShelf:Math.max(run.maxShelf,shelf.filter(Boolean).length)
  },regionCompleted:target.kind==='socket'&&activeRegion(run,level)<activeRegion({placed},level)};
}
export function undoMove(run) {
  if(!run.history.length)return {ok:false,run};
  const history=run.history.slice(),previous=history.pop();
  return {ok:true,run:{
    ...run,stacks:previous.stacks,shelf:previous.shelf,placed:previous.placed,
    moves:previous.moves,maxShelf:Math.max(run.maxShelf,previous.maxShelf),
    finished:previous.finished,undos:run.undos+1,history
  }};
}
export function isComplete(level,run) {
  return run.finished&&run.placed.length===level.colors.length*3&&run.placed.every(Boolean)
    &&run.stacks.every((stack)=>stack.length===0)&&run.shelf.every((gem)=>gem===null);
}
/* If a matching gem is available, placing it can never make the puzzle worse:
   it reduces blocked stack depth or frees the shelf, without consuming a resource.
   DFS explores stages only when direct placements are exhausted. */
function candidateMoves(level,run) {
  const direct=[],stages=[];
  const sources=[];
  run.shelf.forEach((gem,index)=>{if(gem)sources.push({kind:'shelf',index});});
  run.stacks.forEach((stack,index)=>{if(stack.length)sources.push({kind:'stack',index});});
  for(const source of sources) {
    const opts=validDestinations(level,run,source);
    const socket=opts.find((d)=>d.kind==='socket');
    if(socket)direct.push({source,target:socket});
    else if(source.kind==='stack') {
      const slot=opts.find((d)=>d.kind==='shelf');
      if(slot)stages.push({source,target:slot});
    }
  }
  return direct.length?direct:stages;
}
export function solve(level,starting=createRun(level),limit=50000) {
  const visited=new Set();
  let expanded=0;
  function walk(state) {
    if(isComplete(level,state))return [];
    if(++expanded>limit)return null;
    const key=state.stacks.map((s)=>s.map((g)=>g.color).join(',')).join('/')
      +'|'+state.shelf.map((g)=>g?g.color:'-').join(',')
      +'|'+state.placed.map((g)=>g?g.color:'-').join(',');
    if(visited.has(key))return null;
    visited.add(key);
    for(const next of candidateMoves(level,state)) {
      const result=tryMove(level,state,next.source,next.target);
      if(!result.ok)continue;
      const tail=walk(result.run);
      if(tail)return [next,...tail];
    }
    return null;
  }
  const path=walk(starting);
  return path?{path,nodes:expanded}:null;
}
export function hint(level,run) {
  const solution=solve(level,run);
  return solution&&solution.path.length?solution.path[0]:null;
}
export function assertLevel(level) {
  if(!level||level.version!==1||level.stacks.length!==3||level.shelfCapacity<2)return false;
  if(level.colors.length<3||level.colors.length>5||level.stacks.some((s)=>s.length!==level.colors.length))return false;
  const needed=new Map(level.colors.map((color)=>[color,3]));
  for(const stack of level.stacks)for(const color of stack) {
    if(!needed.has(color))return false;
    needed.set(color,needed.get(color)-1);
  }
  return [...needed.values()].every((value)=>value===0);
}
