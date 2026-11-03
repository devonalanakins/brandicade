/** Derived, read-only achievements belonging to Brandicade as a whole.
 * Neither contributing game is modified or granted XP when these appear.
 */
export const ARCADE_PASSPORT = Object.freeze([
 {id:'BA-001',name:'Double Bloom',description:'Win a Glimmer Pop puzzle and restore your first Prism Garden mosaic.',rarity:'common'},
 {id:'BA-002',name:'Two Little Worlds',description:'Finish five distinct Glimmer Pop levels and five Prism Garden mosaics.',rarity:'rare'},
 {id:'BA-003',name:'Golden Glow',description:'Earn a three-star Glimmer Pop win and a gold Prism Garden Mastery medal.',rarity:'rare'},
 {id:'BA-004',name:'Crossing the Garden',description:'Restore a mosaic in all three Prism worlds and win in Glimmer Pop.',rarity:'epic'},
 {id:'BA-005',name:"Curator's Crown",description:'Restore all eighteen Prism mosaics and finish twelve distinct Glimmer Pop levels.',rarity:'epic'},
 {id:'BA-006',name:'The Whole Cabinet',description:'Earn every Glimmer Pop trophy and every Prism Garden trophy.',rarity:'legendary'},
]);

const isRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);

/** A derived view, not an award mutation. Unknown/inaccessible progress fails closed. */
export function deriveArcadePassport(glimmer,prism,glimmerDefinitions) {
 const available=glimmer?.schemaVersion===1 && isRecord(glimmer.progression) &&
  isRecord(glimmer.progression.levels) && isRecord(glimmer.stats) &&
  isRecord(glimmer.achievements) && Array.isArray(glimmerDefinitions) &&
  glimmerDefinitions.length>0 && glimmerDefinitions.every(a=>typeof a.id==='string') &&
  prism?.available===true && Number.isInteger(prism.completed) &&
  Number.isInteger(prism.earned) && Number.isInteger(prism.worldsVisited) &&
  Number.isInteger(prism.goldMedals) &&
  prism.completed>=0 && prism.completed<=prism.totalLevels &&
  prism.earned>=0 && prism.earned<=prism.totalAchievements;
 if(!available)return {available:false,earned:null,total:ARCADE_PASSPORT.length,awards:[]};
 const beaten=Object.entries(glimmer.progression.levels).filter(([id,result])=>
  /^(?:[1-9]\d*)$/.test(id)&&isRecord(result)&&Number.isInteger(result.stars)&&result.stars>=1&&result.stars<=3);
 const glimmerWon=glimmer.stats.wins>0&&beaten.length>0;
 const threeStars=beaten.some(([,level])=>level.stars===3);
 const allGlimmer=glimmerDefinitions.every(def=>typeof glimmer.achievements[def.id]==='string');
 const passed=[
  glimmerWon&&prism.completed>=1,
  beaten.length>=5&&prism.completed>=5,
  threeStars&&prism.goldMedals>=1,
  glimmerWon&&prism.worldsVisited===3,
  beaten.length>=12&&prism.completed===prism.totalLevels,
  allGlimmer&&prism.earned===prism.totalAchievements,
 ];
 const awards=ARCADE_PASSPORT.map((def,index)=>({...def,unlocked:passed[index]}));
 return {available:true,earned:passed.filter(Boolean).length,total:awards.length,awards};
}
