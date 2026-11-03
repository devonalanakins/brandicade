/** Read-only Brandicade summary of Prism Garden's own device-local save.
 * The arcade never imports, rewrites or awards another game's progress.
 */
import {LEVELS} from './content.mjs';
import {ACHIEVEMENTS,readStoredProgress} from './achievements.mjs';

export function prismArcadeSummary(storage) {
 const {progress,recoveryRequired}=readStoredProgress(storage);
 const totalLevels=LEVELS.length,totalAchievements=ACHIEVEMENTS.length;
 if(recoveryRequired)return {
  available:false,completed:null,totalLevels,earned:null,totalAchievements,awards:[]
 };
 const awards=ACHIEVEMENTS.map(a=>({
  id:a.id,name:a.name,unlocked:!!progress.awards[a.id]
 }));
 return {
  available:true,completed:Object.keys(progress.completed).length,totalLevels,
  earned:awards.filter(a=>a.unlocked).length,totalAchievements,awards
 };
}
