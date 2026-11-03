import {GEMS,LEVELS,WORLDS,levelByNumber,levelById} from './content.mjs';
import {createRun,activeRegion,selectedGem,validDestinations,tryMove,undoMove,hint,solve,isComplete} from './engine.mjs';
import {ACHIEVEMENTS,readStoredProgress,persistProgress,earned,evaluateAchievements} from './achievements.mjs';
import {renderRestoration,restorationState} from './restoration-scene.mjs';
const app=document.querySelector('#prism-app');
const initialSave=readStoredProgress();
const progress=initialSave.progress;
let saveBlocked=initialSave.recoveryRequired,saveSnapshot=initialSave.raw;
const SAVE_WARNING='Your saved game could not be verified or another tab updated it. The original data remains untouched. Open Settings to download your data or restore a verified backup.';
let run=null,selected=null,screen='home',message='',newAwards=[],soundContext=null,desiredMode='sanctuary',hintTarget=null,pendingChange=null,recentPlacement=null;
const escape=(s)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const gem=(color,small=false)=>'<span class="crystal shape-'+GEMS[color].symbol+(small?' small':'')+'" style="--gem:'+GEMS[color].color+'" aria-hidden="true"><span class="facet"></span></span>';
const badge=(achievement,unlocked)=>'<article class="pg-badge '+(unlocked?'earned':'locked')+'"><span class="pg-badge-mark" aria-hidden="true">'+achievement.icon+'</span><div><b>'+escape(achievement.name)+'</b><small>'+escape(achievement.description)+'</small></div><span class="pg-badge-state">'+(unlocked?'Earned':'Locked')+'</span></article>';
const worldDone=(worldIndex)=>LEVELS.slice(worldIndex*6,worldIndex*6+6).every(l=>progress.completed[l.id]);
const nextLevel=()=>LEVELS.find(l=>!progress.completed[l.id])||LEVELS[17];
const unlocked=(level)=>level.number===1||!!progress.completed[LEVELS[level.number-2].id]||!!progress.completed[level.id];
function playSound(freq=470) {
 if(!progress.settings.sound)return;
 try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
 soundContext??=new Audio();if(soundContext.state==='suspended')void soundContext.resume();
 const oscillator=soundContext.createOscillator(),gain=soundContext.createGain();
 oscillator.type='sine';oscillator.frequency.setValueAtTime(freq,soundContext.currentTime);
 oscillator.frequency.exponentialRampToValueAtTime(freq*1.3,soundContext.currentTime+.12);
 gain.gain.setValueAtTime(.035,soundContext.currentTime);
 gain.gain.exponentialRampToValueAtTime(.001,soundContext.currentTime+.14);
 oscillator.connect(gain).connect(soundContext.destination);oscillator.start();oscillator.stop(soundContext.currentTime+.15);
 }catch{}
}
function commit() {
 if(saveBlocked){message=SAVE_WARNING;return;}
 if(!persistProgress(progress,globalThis.localStorage,saveSnapshot)){
  saveBlocked=true;message=SAVE_WARNING;return;
 }
 saveSnapshot=JSON.stringify(progress);
}
function nav(target) {screen=target;selected=null;hintTarget=null;recentPlacement=null;newAwards=[];message='';render();}
function reset(level,mode='sanctuary') {
 if(saveBlocked){screen='settings';message=SAVE_WARNING;render();return;}
 const id='pg-'+level.id+'-'+String(Date.now());
 run=createRun(level,{mode,runId:id});selected=null;hintTarget=null;recentPlacement=null;pendingChange=null;newAwards=[];message='';
 progress.active=run;commit();screen='game';render();
}
function requestRunChange(level,mode='sanctuary',kind='switch') {
 const active=progress.active;
 if(active&&!active.finished&&(active.moves>0||active.hints>0||active.undos>0)){
  pendingChange={levelId:level.id,mode,kind};
  render();
  return;
 }
 reset(level,mode);
}
function cancelRunChange(){
 pendingChange=null;
 if(screen==='game'){
  render();
  app.querySelector?.('[data-action="restart"]')?.focus?.();
 }else resume();
}
function resume() {
 const saved=progress.active,level=saved&&levelById(saved.levelId);
 if(level&&saved.stacks&&saved.placed&&!saved.finished){run=saved;screen='game';selected=null;hintTarget=null;render();}
 else reset(nextLevel());
}
function showGame() {
 const level=levelById(run.levelId),world=WORLDS[level.worldIndex];
 const area=activeRegion(run,level);
 const destinations=selected?validDestinations(level,run,selected):[];
 const valid=(kind,index)=>destinations.some(d=>d.kind===kind&&d.index===index);
 const hinted=(kind,index)=>hintTarget?.kind===kind&&hintTarget.index===index;
 const hintedSource=(kind,index)=>!!hintTarget&&selected?.kind===kind&&selected.index===index;
 const newlyPlaced=(kind,index)=>recentPlacement?.kind===kind&&recentPlacement.index===index;
 const sockets=run.placed.map((gemIn,i)=>'<button type="button" class="pg-socket '+(gemIn?'occupied':'')+' '+(valid('socket',i)?'target':'')+' '+(Math.floor(i/3)>area?'sealed':'')+' '+(hinted('socket',i)?'hint-destination':'')+' '+(newlyPlaced('socket',i)?'just-placed':'')+'" data-kind="socket" data-index="'+i+'" '+(gemIn?'disabled':'')+' aria-label="Socket '+(i+1)+', '+GEMS[level.colors[Math.floor(i/3)]].label+(gemIn?', filled':Math.floor(i/3)>area?', locked':', empty')+(hinted('socket',i)?', suggested by hint':'')+'">'+(gemIn?gem(gemIn.color):'<span class="pg-socket-hint">'+(GEMS[level.colors[Math.floor(i/3)]].label[0])+'</span>')+'</button>').join('');
 const stacks=run.stacks.map((stack,i)=>'<button type="button" class="pg-stack '+(selected?.kind==='stack'&&selected.index===i?'selected':'')+' '+(hintedSource('stack',i)?'hint-source':'')+'" data-kind="stack" data-index="'+i+'" '+(!stack.length?'disabled':'')+' aria-label="Supply stack '+(i+1)+', '+stack.length+' gems, '+(stack[0]?GEMS[stack[0].color].label+' exposed':'empty')+'"><span class="pg-stack-depth">'+stack.length+'</span>'+(stack.length?gem(stack[0].color)+(progress.settings.colorAssist?'<span class="pg-gem-label">'+GEMS[stack[0].color].label+'</span>':''):'<span class="pg-empty">·</span>')+'</button>').join('');
 const shelf=run.shelf.map((entry,i)=>'<button type="button" class="pg-shelf-slot '+(selected?.kind==='shelf'&&selected.index===i?'selected':'')+' '+(valid('shelf',i)?'target':'')+' '+(hinted('shelf',i)?'hint-destination':'')+' '+(hintedSource('shelf',i)?'hint-source':'')+' '+(newlyPlaced('shelf',i)?'just-placed':'')+'" data-kind="shelf" data-index="'+i+'" aria-label="Holding shelf slot '+(i+1)+', '+(entry?GEMS[entry.color].label:'empty')+(hinted('shelf',i)?', suggested by hint':'')+'">'+(entry?gem(entry.color)+(progress.settings.colorAssist?'<span class="pg-gem-label">'+GEMS[entry.color].label+'</span>':''):'<span class="pg-empty">+</span>')+'</button>').join('');
 const count=run.placed.filter(Boolean).length,total=run.placed.length;
 return '<div class="pg-game"><div class="pg-topline"><button class="pg-icon-button" data-nav="home" aria-label="Return to Prism Garden home">←</button><div><small>'+escape(world.short)+' · '+escape(run.mode)+'</small><h2>'+escape(level.name)+'</h2></div><button class="pg-icon-button" data-nav="settings" aria-label="Settings">⚙</button></div>'+
 '<div class="pg-progress"><span>Restoration <b>'+count+'/'+total+'</b></span><div class="pg-progress-track"><i style="width:'+(count/total*100)+'%"></i></div></div>'+
 '<div class="pg-world-scene pg-scene-'+world.scene+'"><div class="pg-scene-glow"></div>'+renderRestoration(level.worldIndex,saveBlocked?null:progress.completed,{variant:'play'})+'<div class="pg-arch"><div class="pg-mosaic">'+sockets+'</div></div><div class="pg-scene-floor"></div></div>'+
 '<div class="pg-task"><b>'+(area===level.colors.length?'Garden restored': 'Restore '+GEMS[level.colors[area]].label+' jewels')+'</b><span>'+(selected?'Choose a highlighted destination':'Choose an exposed jewel')+'</span></div>'+
 '<div class="pg-supplies"><div class="pg-supply-heading">JEWEL STACKS <span>Moves '+run.moves+'</span></div><div class="pg-stacks">'+stacks+'</div><div class="pg-supply-heading">HOLDING SHELF <span>'+run.shelf.filter(Boolean).length+' / '+run.shelf.length+'</span></div><div class="pg-shelf">'+shelf+'</div></div>'+
 '<div class="pg-tools"><button data-action="undo" '+(!run.history.length?'disabled':'')+'>↶ Undo</button><button data-action="hint">✧ Hint</button><button data-action="restart">Restart</button></div>'+
 '<p class="pg-live" role="status" aria-live="polite">'+escape(message||'Take your time. Nothing expires here.')+'</p><p class="pg-game-mode-note">'+(run.mode==='mastery'?'Mastery: earn a gold medal through efficient moves without hints.':'Sanctuary: no timer, no penalties and unlimited undo.')+'</p></div>';
}
function showHome() {
 const complete=Object.keys(progress.completed).length,earnedCount=Object.keys(progress.awards).length;
 return '<div class="pg-intro"><div class="pg-eyebrow">A LIVING JEWEL GARDEN</div><h1>Prism <em>Garden.</em></h1><p>Every jewel finds its place. Every puzzle brings a little world back to life.</p><div class="pg-home-art" aria-hidden="true"><div class="pg-halo"></div><span class="pg-art-gem a">'+gem('fern')+'</span><span class="pg-art-gem b">'+gem('dew')+'</span><span class="pg-art-gem c">'+gem('ember')+'</span><span class="pg-art-gem d">'+gem('orchid')+'</span><span class="pg-art-gem e">'+gem('moon')+'</span></div><div class="pg-main-actions"><button class="pg-primary" data-action="continue">'+(progress.active&&!progress.active.finished?'Continue your garden':'Begin the next puzzle')+' →</button><button data-nav="atlas">Choose a world</button></div><div class="pg-summary"><div><b>'+complete+' / 18</b><small>Mosaics restored</small></div><div><b>'+earnedCount+' / 18</b><small>Achievements</small></div></div></div>'+
 '<div class="pg-home-links"><button data-nav="gallery"><span>◇</span><div><b>Living gallery</b><small>Your collected scenes</small></div>→</button><button data-nav="achievements"><span>✦</span><div><b>Achievement cabinet</b><small>Earned and undiscovered treasures</small></div>→</button><button data-nav="settings"><span>⚙</span><div><b>Settings</b><small>Sound, motion and accessibility</small></div>→</button></div>';
}
function showAtlas() {
 return '<div class="pg-page-head"><div class="pg-eyebrow">THE WORLD ATLAS</div><h1>Three living worlds.</h1><p>Choose a level. Every collected mosaic stays yours.</p><div class="pg-mode-tabs" role="group" aria-label="Game mode"><button data-mode-choice="sanctuary" aria-pressed="'+(desiredMode==='sanctuary')+'">Sanctuary · Relax</button><button data-mode-choice="mastery" aria-pressed="'+(desiredMode==='mastery')+'">Mastery · Medals</button></div><small class="pg-mode-help">'+(desiredMode==='mastery'?'Mastery replays completed puzzles to earn move-efficiency medals.':'No timer, no lives, unlimited undo and optional hints.')+'</small></div>'+
 WORLDS.map((world,i)=>'<section class="pg-world-card" style="--accent:'+world.accent+'"><div class="pg-world-head"><div><small>CHAPTER 0'+(i+1)+'</small><h2>'+world.name+'</h2><p>'+world.detail+'</p></div><span>'+LEVELS.slice(i*6,i*6+6).filter(l=>progress.completed[l.id]).length+'/6</span></div><div class="pg-atlas-restoration">'+renderRestoration(i,saveBlocked?null:progress.completed,{variant:'atlas'})+'</div><div class="pg-level-grid">'+LEVELS.slice(i*6,i*6+6).map(l=>'<button '+(!unlocked(l)?'disabled':'')+' data-level="'+l.number+'" aria-label="'+escape(l.name)+(unlocked(l)?'':', locked')+'" class="'+(progress.completed[l.id]?'cleared':'')+'"><small>'+String(l.number).padStart(2,'0')+'</small><b>'+(progress.completed[l.id]?'✦':unlocked(l)?'◇':'•')+'</b><span>'+escape(l.name)+'</span></button>').join('')+'</div></section>').join('');
}
function showGallery() {
 return '<div class="pg-page-head"><div class="pg-eyebrow">THE LIVING GALLERY</div><h1>Every light you found.</h1><p>Collected scenes never expire. Revisit any finished world.</p></div>'+
 WORLDS.map((world,i)=>{
  const state=restorationState(i,saveBlocked?null:progress.completed);
  const description=!state.available?'Saved progress is unavailable until recovery.':worldDone(i)?
   'All six mosaics restored. A whole world awake.':state.count+' of 6 mosaics restored. Each one brings a new detail to life.';
  return '<section class="pg-gallery-world"><div class="pg-gallery-scene pg-scene-'+world.scene+'">'+
   renderRestoration(i,saveBlocked?null:progress.completed,{variant:'gallery'})+
   '<span class="pg-gallery-world-name">'+escape(world.short)+'</span></div>'+
   '<div class="pg-gallery-details"><h2>'+escape(world.name)+'</h2><p class="pg-restoration-description">'+escape(description)+'</p>'+
   '<div class="pg-collectibles">'+LEVELS.slice(i*6,i*6+6).map(l=>
    '<span class="'+(progress.completed[l.id]?'owned':'')+'" title="'+escape(l.name)+'">'+(progress.completed[l.id]?'✦':'·')+'</span>').join('')+'</div>'+
   (worldDone(i)?'<button data-action="night" data-world="'+i+'">'+(progress.settings.night?'Return to daylight':'View by moonlight')+
    '</button><button data-action="secret" data-world="'+i+'" class="pg-secret" aria-label="Inspect the hidden garden light">✧</button>':'')+
   '</div></section>';
 }).join('');
}
function showAchievements() {
 const count=Object.keys(progress.awards).length;
 return '<div class="pg-page-head"><div class="pg-eyebrow">THE TROPHY CONSERVATORY</div><h1>Earned in your own time.</h1><p>'+count+' of 18 treasures discovered. No paid rewards, expiring badges or streaks.</p></div><div class="pg-award-summary"><span>✶</span><div><b>'+count+' / 18</b><small>Permanent achievements</small></div></div><div class="pg-badges">'+ACHIEVEMENTS.map(a=>badge(a,!!progress.awards[a.id])).join('')+'</div>';
}
function showSettings() {
 const s=progress.settings;
 return '<div class="pg-page-head"><div class="pg-eyebrow">YOUR GAME, YOUR PACE</div><h1>Little adjustments.</h1><p>Every setting stays on this device.</p></div><div class="pg-options">'+
 '<label>Music and jewel sounds<input type="checkbox" data-setting="sound" '+(s.sound?'checked':'')+'></label>'+
 '<label>Show gem names<input type="checkbox" data-setting="colorAssist" '+(s.colorAssist?'checked':'')+'></label>'+
 '<label>Moonlight gallery<input type="checkbox" data-setting="night" '+(s.night?'checked':'')+'></label>'+
 '<label>Motion <select data-setting="motion"><option value="system" '+(s.motion==='system'?'selected':'')+'>Follow device</option><option value="off" '+(s.motion==='off'?'selected':'')+'>Reduced</option><option value="on" '+(s.motion==='on'?'selected':'')+'>On</option></select></label>'+
 '</div><p class="pg-settings-note">Progress is saved independently of Glimmer Pop and Brandle. Clearing browser data can delete this device-only progress; cloud sync is not yet enabled.</p>';
}
function finish(level,previouslyCompleted) {
 const current=run;
 progress.completed[level.id]??=new Date().toISOString();
 if(current.mode==='sanctuary'&&!progress.sanctuary.includes(level.id))progress.sanctuary.push(level.id);
 if(current.mode==='mastery'){
   const par=level.stacks.reduce((sum,s)=>sum+s.length,0)+level.colors.length;
   const medal=current.hints===0&&current.moves<=par?'gold':current.moves<=par+3?'silver':'bronze';
   const rank={bronze:1,silver:2,gold:3};
   if(rank[medal]>rank[progress.mastery[level.id]||'bronze']||!progress.mastery[level.id])progress.mastery[level.id]=medal;
 }
 newAwards=evaluateAchievements(progress,current,{replay:previouslyCompleted});
 progress.active=null;hintTarget=null;commit();sound(660);screen='win';render();
}
function sound(f){playSound(f);}
function showWin(){
 const level=levelById(run.levelId),restored=restorationState(level.worldIndex,saveBlocked?null:progress.completed);
 return '<div class="pg-win"><div class="pg-win-orbit">✦</div><div class="pg-eyebrow">MOSAIC RESTORED</div><h1>'+escape(level.name)+'</h1><p>You brought another little piece of the garden to life.</p><div class="pg-win-diorama">'+renderRestoration(level.worldIndex,saveBlocked?null:progress.completed,{variant:'win',freshLevelId:level.id})+'</div><p class="pg-world-restored-label">'+(restored.available?restored.count+' of '+restored.total+' world mosaics restored':'Progress needs recovery')+'</p><div class="pg-win-stats"><span>'+run.moves+' moves</span><span>'+run.undos+' undos</span><span>'+run.hints+' hints</span></div>'+
 (newAwards.length?'<h2>New treasures</h2><div class="pg-win-awards">'+newAwards.map(a=>badge(a,true)).join('')+'</div>':'<p>Your gallery has grown a little brighter.</p>')+
 '<div class="pg-main-actions"><button class="pg-primary" data-action="next">Next puzzle →</button><button data-action="replay-mastery">Replay in Mastery</button><button data-nav="gallery">View gallery</button><button data-nav="achievements">Achievements</button></div></div>';
}
function showConfirmation(){
 if(!pendingChange)return '';
 const current=levelById(progress.active?.levelId),next=levelById(pendingChange.levelId);
 if(!current||!next)return '';
 const restarting=pendingChange.kind==='restart';
 return '<div class="pg-confirm-backdrop"><section class="pg-confirm" role="alertdialog" aria-modal="true" aria-labelledby="pg-confirm-title" aria-describedby="pg-confirm-description">'+
  '<div class="pg-eyebrow">KEEP YOUR PROGRESS SAFE</div>'+
  '<h2 id="pg-confirm-title">'+(restarting?'Restart this mosaic?':'Start a different mosaic?')+'</h2>'+
  '<p id="pg-confirm-description">'+(restarting?'The moves in this unfinished puzzle will be reset.':'Your unfinished '+escape(current.name)+' puzzle will be replaced by '+escape(next.name)+'.')+' Completed mosaics and achievements will stay saved.</p>'+
  '<div class="pg-confirm-actions"><button type="button" data-action="cancel-run-change">Keep playing</button>'+
  '<button type="button" class="pg-confirm-replace" data-action="accept-run-change">'+(restarting?'Restart puzzle':'Start new puzzle')+'</button></div>'+
  '</section></div>';
}
function render(){
 const motion=progress.settings.motion;
 app.dataset.motion=motion==='system'&&matchMedia('(prefers-reduced-motion: reduce)').matches?'off':motion;
 app.dataset.night=progress.settings.night?'yes':'no';
 const storageNotice=saveBlocked?'<section class="pg-storage-warning" role="alert"><b>Saved-game protection is on</b><p>'+escape(SAVE_WARNING)+'</p><button type="button" data-nav="settings">Open recovery tools</button></section>':'';
 app.innerHTML='<div class="pg-shell"><header class="pg-header"><a href="/#home" class="pg-back">← Brandicade</a><button data-nav="home" class="pg-brand"><span class="pg-brand-mark">✧</span><span>PRISM <b>GARDEN</b></span></button><button data-nav="achievements" class="pg-header-awards" aria-label="Open achievements">✦ <b>'+Object.keys(progress.awards).length+'</b></button></header><main>'+storageNotice+({home:showHome,atlas:showAtlas,game:showGame,gallery:showGallery,achievements:showAchievements,settings:showSettings,win:showWin}[screen]||showHome)()+'</main><footer>MADE FOR BRANDI · NO ADS · NO CLOCKS · ALL YOURS</footer></div>'+showConfirmation();
 if(pendingChange){
  const shell=app.querySelector?.('.pg-shell');if(shell)shell.inert=true;
  app.querySelector?.('[data-action="cancel-run-change"]')?.focus?.();
 }
}
app.addEventListener('click',(event)=>{
 const button=event.target.closest('button');if(!button||button.disabled)return;
 if(saveBlocked&&!button.dataset.nav){screen='settings';message=SAVE_WARNING;render();return;}
 if(pendingChange){
  if(button.dataset.action==='cancel-run-change')cancelRunChange();
  else if(button.dataset.action==='accept-run-change'){
   const confirmed=pendingChange;
   const level=levelById(confirmed.levelId);
   pendingChange=null;
   if(level)reset(level,confirmed.mode);else render();
  }
  return;
 }
 if(button.dataset.nav){nav(button.dataset.nav);return;}
 if(button.dataset.modeChoice){desiredMode=button.dataset.modeChoice;render();return;}
 if(button.dataset.level){const level=levelByNumber(button.dataset.level);if(level&&unlocked(level)){if(desiredMode==='mastery'&&!progress.completed[level.id]){message='Complete this level in Sanctuary first.';desiredMode='sanctuary';render();return;}requestRunChange(level,desiredMode,'switch');}return;}
 const action=button.dataset.action;
 if(action==='continue'){resume();return;}
 if(action==='next'){const next=levelByNumber(Math.min(18,levelById(run.levelId).number+1));reset(next);return;}
 if(action==='replay-mastery'){const level=levelById(run.levelId);if(progress.completed[level.id])reset(level,'mastery');return;}
 if(action==='undo'&&run){const result=undoMove(run);if(result.ok){run=result.run;progress.active=run;selected=null;hintTarget=null;recentPlacement=null;message='Last move undone.';commit();render();}return;}
 if(action==='restart'&&run){requestRunChange(levelById(run.levelId),run.mode,'restart');return;}
 if(action==='hint'&&run){
  const level=levelById(run.levelId),move=hint(level,run);
  run.hints++;progress.active=run;commit();selected=move?.source||null;hintTarget=move?.target||null;recentPlacement=null;
  if(move){
   const selectedColor=selectedGem(run,move.source).color;
   const destination=move.target.kind==='socket'?'socket '+(move.target.index+1):'holding shelf slot '+(move.target.index+1);
   message='Hint: move the '+GEMS[selectedColor].label.toLowerCase()+' jewel to '+destination+'.';
  }else message='No winning route from here. Undo or restart to try a different path.';
  render();return;
 }
 if(action==='night'){progress.settings.night=!progress.settings.night;if(progress.settings.night&&WORLDS.some((_,i)=>worldDone(i)))earned(progress,'PG-ACH-018');commit();render();return;}
 if(action==='secret'){if(worldDone(Number(button.dataset.world))){earned(progress,'PG-ACH-015');commit();message='You found the hidden glimmer.';render();}return;}
 if(screen!=='game'||!run||!button.dataset.kind)return;
 const level=levelById(run.levelId),kind=button.dataset.kind,index=Number(button.dataset.index);
 const target={kind,index};
 if(selected&&validDestinations(level,run,selected).some(d=>d.kind===kind&&d.index===index)){
   const result=tryMove(level,run,selected,target);
   if(result.ok){
     run=result.run;selected=null;hintTarget=null;recentPlacement={kind,index};message=result.regionCompleted?'A little more of the garden is awake.':'Beautifully placed.';
     if(run.finished){finish(level,!!progress.completed[level.id]);return;}
     progress.active=run;commit();playSound(450);render();
      if(event.detail===0){const focus=app.querySelector?.('[data-kind="'+kind+'"][data-index="'+index+'"]:not([disabled])')||app.querySelector?.('[data-action="undo"]');focus?.focus?.();}
      return;
   }
 }
 if(kind!=='socket'&&selectedGem(run,target)){selected=selected&&selected.kind===kind&&selected.index===index?null:target;hintTarget=null;recentPlacement=null;message='Choose a glowing destination.';}
 else{recentPlacement=null;message='That jewel does not fit there. Pick a highlighted place.';}
 render();
 if(event.detail===0){app.querySelector?.('[data-kind="'+kind+'"][data-index="'+index+'"]:not([disabled])')?.focus?.();}
});
// Keep keyboard focus inside the accessible confirmation; Escape never discards a run.
app.addEventListener('keydown',(event)=>{
 if(!pendingChange)return;
 if(event.key==='Escape'){
  event.preventDefault();
  cancelRunChange();
  return;
 }
 if(event.key!=='Tab')return;
 const buttons=app.querySelectorAll?.('.pg-confirm-actions button');
 if(!buttons?.length)return;
 const first=buttons[0],last=buttons[buttons.length-1];
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
});
app.addEventListener('change',(event)=>{
 const key=event.target.dataset.setting;if(!key)return;
 if(saveBlocked){render();return;}
 progress.settings[key]=key==='motion'?event.target.value:event.target.checked;
 commit();render();
});
render();
