/** Read-only Brandicade summary of Prism Garden's own device-local save.
 * The arcade never imports, rewrites or awards another game's progress.
 */
import {LEVELS} from './content.mjs';
import {ACHIEVEMENTS,readStoredProgress} from './achievements.mjs';

export function prismArcadeSummary(storage) {
 const {progress,recoveryRequired}=readStoredProgress(storage);
 const totalLevels=LEVELS.length,totalAchievements=ACHIEVEMENTS.length;
 if(recoveryRequired)return {
  available:false,completed:null,totalLevels,earned:null,totalAchievements,awards:[],
  worldsVisited:null,goldMedals:null,worldProgress:null,nextLevel:null,activeLevel:null
 };
 const awards=ACHIEVEMENTS.map(a=>({
  id:a.id,name:a.name,description:a.description,kind:a.kind,unlocked:!!progress.awards[a.id]
 }));
 const completedLevels=LEVELS.filter(level=>Object.hasOwn(progress.completed,level.id));
 const worldProgress=Object.fromEntries([...new Set(LEVELS.map(level=>level.world))].map(world=>
  [world,completedLevels.filter(level=>level.world===world).length]));
 const goldMedals=completedLevels.filter(level=>progress.mastery[level.id]==='gold').length;
 const next=LEVELS.find(level=>!Object.hasOwn(progress.completed,level.id));
 const active=LEVELS.find(level=>level.id===progress.active?.levelId);
 return {
  available:true,completed:completedLevels.length,totalLevels,
  earned:awards.filter(a=>a.unlocked).length,totalAchievements,awards,
  worldsVisited:Object.values(worldProgress).filter(n=>n>0).length,
  goldMedals,worldProgress,nextLevel:next?.name??null,activeLevel:active?.name??null
 };
}
