/* Prism Garden content — original deterministic levels; no external assets or dependencies. */
export const GEMS = Object.freeze({
  fern:   {label:'Fern',   color:'#6dca9f',symbol:'leaf'},
  dew:    {label:'Dew',    color:'#6fd5da',symbol:'drop'},
  ember:  {label:'Ember',  color:'#efa76d',symbol:'flame'},
  orchid: {label:'Orchid', color:'#c6a0ed',symbol:'flower'},
  moon:   {label:'Moon',   color:'#91aeea',symbol:'crescent'},
  rose:   {label:'Rose',   color:'#ed9db8',symbol:'heart'}
});
export const WORLDS = Object.freeze([
  {id:'dewglass',name:'Dewglass Conservatory',short:'Dewglass',tagline:'Where the first light finds its way.',accent:'#6dca9f',detail:'Bring a sleeping greenhouse back to life.',scene:'conservatory'},
  {id:'ember',name:'Ember Orchard',short:'Ember Orchard',tagline:'A little warmth, held in every jewel.',accent:'#efa76d',detail:'Wake the lantern fruit and the wandering fireflies.',scene:'orchard'},
  {id:'moonpool',name:'Moonpool Atrium',short:'Moonpool',tagline:'Follow the light across still water.',accent:'#91aeea',detail:'Restore moonlit reflections and floating petals.',scene:'moonpool'}
]);
const NAMES = [
  'First Dew','The Fern Door','Glass Petals','A Little Sun','The First Butterfly','The Glasshouse Wakes',
  'Amber Seed','Lantern Fruit','Orchard Wind','Copper Leaves','A Thousand Fireflies','The Orchard Glows',
  'Silver Ripples','The Iris Gate','Blue Reflection','The Quiet Current','A Crown of Moonlight','The Atrium Returns'
];
/* Exposed top to buried bottom. Three stacks hold one jewel of each region.
   These curated arrangements have different buffer pressure, but no RNG or ads. */
const PLANS = [
  [[0,1,2],[0,1,2],[0,1,2]],
  [[1,0,2],[0,1,2],[0,1,2]],
  [[1,0,2],[0,2,1],[0,1,2]],
  [[1,0,2],[1,0,2],[0,2,1]],
  [[2,0,1],[1,0,2],[0,1,2]],
  [[2,0,1],[1,0,2],[2,0,1]],
  [[0,1,2,3],[0,1,2,3],[0,1,2,3]],
  [[1,0,2,3],[0,2,1,3],[0,1,2,3]],
  [[2,0,1,3],[1,0,2,3],[0,2,1,3]],
  [[1,0,3,2],[2,0,1,3],[0,2,3,1]],
  [[2,0,1,3],[3,0,1,2],[1,0,2,3]],
  [[3,0,1,2],[2,0,3,1],[1,0,2,3]],
  [[0,1,2,3,4],[0,1,2,3,4],[0,1,2,3,4]],
  [[1,0,2,3,4],[0,2,1,3,4],[0,1,3,2,4]],
  [[2,0,1,3,4],[1,0,3,2,4],[0,2,1,4,3]],
  [[3,0,1,2,4],[2,0,1,4,3],[1,0,3,2,4]],
  [[4,0,2,1,3],[3,0,1,2,4],[2,0,1,4,3]],
  [[4,0,1,3,2],[3,0,1,4,2],[2,0,1,3,4]]
];
const PALETTES = [
  ['fern','dew','ember'],['fern','ember','orchid','dew'],['dew','orchid','moon','rose','fern']
];
export const LEVELS = Object.freeze(PLANS.map((recipe, index) => {
  const worldIndex=Math.floor(index/6), palette=PALETTES[worldIndex];
  const colors=palette.slice(0,recipe[0].length);
  const stacks=recipe.map((row)=>row.map((position)=>colors[position]));
  return Object.freeze({
    id:'PG-'+String(index+1).padStart(3,'0'),number:index+1,name:NAMES[index],
    world:WORLDS[worldIndex].id,worldIndex,colors,stacks,shelfCapacity:index<2?2:4,
    regions:colors.map((color,i)=>({id:i,color,count:3})),version:1
  });
}));
export function levelByNumber(value) {
  const index=Number(value)-1;
  return Number.isInteger(index)&&index>=0&&index<LEVELS.length?LEVELS[index]:null;
}
export function levelById(value) {return LEVELS.find((level)=>level.id===value)||null;}
export function worldFor(level) {return WORLDS[level.worldIndex];}
