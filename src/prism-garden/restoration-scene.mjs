/* Original, dependency-free world art. Every visible layer is earned by its own mosaic. */
import {LEVELS,WORLDS} from './content.mjs';

const ART = Object.freeze({
 conservatory: {
  foundation: [
   '<rect width="640" height="320" rx="20" fill="#142F32"/>',
   '<path d="M0 210Q160 154 320 202T640 197V320H0Z" fill="#254B43"/>',
   '<path d="M0 273Q185 232 335 262T640 250V320H0Z" fill="#173A35"/>',
   '<path d="M70 271V117Q320 -23 570 117V271M94 268V130Q320 13 546 130V268M320 65V275M128 110L320 245L512 110" fill="none" stroke="#A6C8B6" stroke-width="5" opacity=".65"/>',
   '<path d="M107 260V142Q320 36 533 142V260" fill="#B6EEE2" opacity=".06"/>',
   '<ellipse cx="320" cy="294" rx="239" ry="23" fill="#091F22" opacity=".6"/>',
  ],
  stages: [
   '<g fill="#C4F9E7" opacity=".93"><path d="M125 244Q138 216 151 244Q152 257 139 259Q126 259 125 244Z"/><path d="M486 244Q499 216 512 244Q512 257 499 259Q487 259 486 244Z"/><circle cx="139" cy="247" r="3" fill="#FFFFFF"/><circle cx="499" cy="247" r="3" fill="#FFFFFF"/></g>',
   '<path d="M108 267Q89 225 126 185Q160 150 141 115M534 268Q559 227 522 181Q492 148 510 110" fill="none" stroke="#8FD5A5" stroke-width="7" stroke-linecap="round"/><g fill="#91DCAC"><ellipse cx="112" cy="205" rx="18" ry="8" transform="rotate(-45 112 205)"/><ellipse cx="142" cy="176" rx="18" ry="8" transform="rotate(40 142 176)"/><ellipse cx="527" cy="205" rx="18" ry="8" transform="rotate(40 527 205)"/><ellipse cx="500" cy="169" rx="18" ry="8" transform="rotate(-37 500 169)"/></g>',
   '<g fill="#E9B2D9" stroke="#FFE7F2" stroke-width="2"><path d="M188 249Q168 216 196 214Q209 190 226 217Q258 222 232 243Q235 271 210 261Q189 274 188 249Z"/><path d="M417 247Q394 219 420 211Q431 185 451 213Q481 220 459 244Q460 273 438 261Q421 278 417 247Z"/></g><g fill="#FFE9A5"><circle cx="213" cy="239" r="10"/><circle cx="437" cy="239" r="10"/></g>',
   '<g stroke="#F7E9A4" stroke-width="6" opacity=".62" stroke-linecap="round"><path d="M320 75V20M280 88L240 37M359 88L403 36M269 123L216 100M370 123L423 99"/></g><circle cx="320" cy="105" r="27" fill="#FFE9A7" opacity=".6"/>',
   '<g transform="translate(459 126)" fill="#E2C3F7" stroke="#FDF0FF" stroke-width="2"><path d="M0 0Q-42 -35 -44 4Q-27 23 0 9Z"/><path d="M0 0Q42 -35 44 4Q27 23 0 9Z"/><path d="M0 7Q-27 23 -13 36L0 17Z"/><path d="M0 7Q27 23 13 36L0 17Z"/></g><path d="M459 123V149" stroke="#6F607D" stroke-width="4"/>',
   '<circle cx="320" cy="199" r="54" fill="#C7F9C8" opacity=".22"/><g transform="translate(320 202)" fill="#BDEFC6" stroke="#FAEED1" stroke-width="2"><ellipse cy="-27" rx="14" ry="25"/><ellipse cy="27" rx="14" ry="25"/><ellipse cx="-27" rx="25" ry="14"/><ellipse cx="27" rx="25" ry="14"/></g><circle cx="320" cy="202" r="13" fill="#F8E8AA"/><path d="M320 177V137M320 227V263M294 202H254M347 202H387" stroke="#F5E8B3" opacity=".75" stroke-width="3"/>',
  ],
 },
 orchard: {
  foundation: [
   '<rect width="640" height="320" rx="20" fill="#392B32"/>',
   '<circle cx="487" cy="77" r="92" fill="#C5845C" opacity=".17"/>',
   '<path d="M0 230Q114 167 236 212Q358 163 500 220Q573 192 640 213V320H0Z" fill="#654531"/>',
   '<path d="M0 268Q176 219 320 255Q494 225 640 252V320H0Z" fill="#392F2C"/>',
   '<path d="M320 285Q302 237 310 181Q317 129 296 81M318 177Q267 128 194 113M318 178Q376 131 453 114M309 207Q254 167 227 171M324 206Q387 170 420 180" fill="none" stroke="#9D755C" stroke-width="18" stroke-linecap="round"/>',
   '<path d="M320 285V177M317 180Q273 134 195 113M322 181Q383 132 452 114" fill="none" stroke="#E0B78B" stroke-width="3" opacity=".4"/>',
   '<ellipse cx="322" cy="292" rx="252" ry="20" fill="#180F20" opacity=".45"/>',
  ],
  stages: [
   '<g stroke="#9FD8A3" stroke-width="4" stroke-linecap="round"><path d="M100 273V246M542 275V245M165 284V256"/></g><g fill="#8BD69B"><ellipse cx="92" cy="245" rx="17" ry="8" transform="rotate(32 92 245)"/><ellipse cx="110" cy="247" rx="16" ry="7" transform="rotate(-29 110 247)"/><ellipse cx="535" cy="247" rx="17" ry="8" transform="rotate(29 535 247)"/><ellipse cx="550" cy="243" rx="16" ry="7" transform="rotate(-32 550 243)"/></g>',
   '<g fill="#F9BB73" stroke="#FFE0AD" stroke-width="2"><path d="M191 127Q171 155 187 169Q208 184 223 159Q229 140 211 127Z"/><path d="M447 128Q427 156 442 172Q468 185 480 158Q486 140 467 128Z"/><path d="M247 166Q229 189 242 201Q264 212 274 194Q279 177 264 165Z"/></g><path d="M206 126V109M462 126V111M258 166V151" stroke="#F1D19B" stroke-width="3"/>',
   '<g fill="none" stroke="#E8C59B" stroke-width="3" opacity=".8" stroke-linecap="round"><path d="M72 170Q115 139 152 156Q174 163 190 153"/><path d="M452 215Q490 193 528 204Q553 213 574 200"/><path d="M78 192Q122 170 146 186"/><path d="M486 233Q525 218 549 229"/></g>',
   '<g fill="#DDA16A" stroke="#F7C28B" stroke-width="1"><path d="M235 100Q245 80 260 98Q263 122 243 124Z"/><path d="M397 97Q379 75 371 101Q376 125 390 120Z"/><path d="M143 179Q155 153 173 170Q169 192 154 196Z"/><path d="M488 179Q467 158 459 177Q467 201 485 194Z"/></g>',
   '<g fill="#FFF2B8"><circle cx="135" cy="124" r="4"/><circle cx="507" cy="143" r="4"/><circle cx="395" cy="65" r="3.5"/><circle cx="194" cy="213" r="4"/><circle cx="559" cy="238" r="3"/><circle cx="92" cy="205" r="3.5"/></g><g fill="#FFF8C8" opacity=".23"><circle cx="135" cy="124" r="17"/><circle cx="507" cy="143" r="19"/><circle cx="395" cy="65" r="16"/><circle cx="194" cy="213" r="18"/></g>',
   '<circle cx="321" cy="113" r="47" fill="#F4B56E" opacity=".25"/><path d="M320 59L335 94L374 103L346 130L355 168L320 148L285 168L294 130L266 103L305 94Z" fill="#F5D092" stroke="#FFE8B4" stroke-width="3"/><circle cx="320" cy="114" r="13" fill="#FFF3C3"/><path d="M320 67V46M320 161V182M273 113H251M367 113H388" stroke="#F9D5A3" stroke-width="3" opacity=".75"/>',
  ],
 },
 moonpool: {
  foundation: [
   '<rect width="640" height="320" rx="20" fill="#192A49"/>',
   '<path d="M0 209L90 123L159 185L261 93L330 188L459 112L558 181L640 143V320H0Z" fill="#2C4162" opacity=".65"/>',
   '<path d="M0 238Q150 208 320 229T640 216V320H0Z" fill="#233C55"/>',
   '<ellipse cx="321" cy="269" rx="286" ry="45" fill="#52799B" opacity=".45"/>',
   '<ellipse cx="320" cy="267" rx="254" ry="29" fill="#1B324E" stroke="#9BC7D9" stroke-width="2" opacity=".65"/>',
   '<path d="M145 226L144 143M496 226V143M132 143H509" fill="none" stroke="#9EABD3" stroke-width="8" opacity=".63"/>',
   '<path d="M136 145Q320 64 500 145" stroke="#9EABD3" stroke-width="5" fill="none" opacity=".55"/>',
  ],
  stages: [
   '<g stroke="#A0DDE9" stroke-width="3" fill="none" opacity=".82"><ellipse cx="315" cy="263" rx="86" ry="13"/><ellipse cx="315" cy="267" rx="148" ry="23"/><path d="M100 255Q130 246 160 254M481 258Q517 245 550 256"/></g>',
   '<path d="M251 232V148Q251 109 321 109Q389 109 389 148V232" fill="none" stroke="#B7BFF1" stroke-width="11" stroke-linecap="round"/><path d="M267 232V153Q267 126 321 126Q374 126 374 153V232" fill="#B6C4F3" opacity=".1"/><path d="M257 152L320 98L383 152" stroke="#E5D5F0" stroke-width="3" fill="none"/>',
   '<g stroke="#A7CCF5" stroke-width="3" opacity=".8"><path d="M319 229V283M303 237V278M337 237V278"/><path d="M266 283Q320 291 374 283" fill="none"/></g><ellipse cx="320" cy="269" rx="40" ry="10" fill="#C7EAF6" opacity=".26"/>',
   '<g stroke="#8CDAD9" stroke-width="3" fill="none" opacity=".9"><path d="M111 275Q179 264 246 275M394 277Q468 263 534 274"/><path d="M168 288Q237 282 278 289M365 287Q409 280 481 288"/></g>',
   '<g fill="#E9E6FF" opacity=".9"><circle cx="218" cy="76" r="4"/><circle cx="419" cy="69" r="4"/><circle cx="481" cy="91" r="3"/><circle cx="176" cy="106" r="3"/></g><path d="M320 31L326 58L353 65L326 72L320 100L313 72L284 65L313 58Z" fill="#EADDFB"/><circle cx="320" cy="65" r="28" fill="#CCCEF3" opacity=".21"/>',
   '<ellipse cx="320" cy="267" rx="85" ry="18" fill="#A2D9E8" opacity=".28"/><g transform="translate(320 247)" fill="#C2BDEE" stroke="#F5E9FF" stroke-width="2"><ellipse cx="-23" cy="0" rx="27" ry="12" transform="rotate(23 -23 0)"/><ellipse cx="23" cy="0" rx="27" ry="12" transform="rotate(-23 23 0)"/><ellipse cx="0" cy="-13" rx="12" ry="28"/></g><circle cx="320" cy="245" r="8" fill="#FFE9B4"/><path d="M320 214V202M283 246H271M359 246H371" stroke="#FCF0C9" stroke-width="3"/>',
  ],
 },
});

const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** One earned scene feature per authored level, never inferred from another game. */
export function restorationState(worldIndex,completed) {
 if(!Number.isInteger(worldIndex)||worldIndex<0||worldIndex>=WORLDS.length)throw new RangeError('Unknown world');
 const world=WORLDS[worldIndex];
 const available=!!completed&&typeof completed==='object'&&!Array.isArray(completed);
 const levels=LEVELS.filter(level=>level.worldIndex===worldIndex).map(level=>({
  id:level.id,name:level.name,restored:available&&typeof completed[level.id]==='string'
 }));
 const count=available?levels.filter(level=>level.restored).length:null;
 return {world,worldIndex,available,count,total:levels.length,levels};
}
/** Accessible, static original SVG illustration; individual earned layers are declarative. */
export function renderRestoration(worldIndex,completed,{variant='gallery',freshLevelId=null}={}) {
 const state=restorationState(worldIndex,completed),art=ART[state.world.scene];
 const safeVariant=['gallery','atlas','play','win'].includes(variant)?variant:'gallery';
 const label=state.available?state.world.name+': '+state.count+' of '+state.total+' mosaics restored':state.world.name+': progress unavailable until the saved game is recovered';
 const features=state.levels.map((level,index)=>{
  const lit=level.restored,highlighted=lit&&level.id===freshLevelId;
  return '<g class="pg-restoration-layer '+(lit?'is-awake':'is-dormant')+(highlighted?' is-new':'')+
   '" data-mosaic="'+level.id+'" data-restored="'+(lit?'yes':'no')+'" data-feature="'+esc(level.name)+'">'+art.stages[index]+'</g>';
 }).join('');
 return '<div class="pg-restoration pg-restoration--'+safeVariant+'" role="img" aria-label="'+esc(label)+'">'+
  '<svg viewBox="0 0 640 320" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">'+
  '<g class="pg-restoration-foundation">'+art.foundation.join('')+'</g>'+features+'</svg></div>';
}
