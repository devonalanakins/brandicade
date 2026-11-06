/** Original, event-driven Prism Garden audio. No game-state, network, or storage effects. */
export const FEEDBACK_TYPES = Object.freeze(['idle','select','place','region','invalid','undo','hint','win']);
const CUES = Object.freeze({
  select: [[392,0,.09,.012]],
  place: [[392,0,.14,.023],[587.33,.065,.17,.024]],
  region: [[392,0,.17,.025],[523.25,.09,.19,.027],[659.25,.19,.23,.029]],
  invalid: [[220,0,.11,.012]],
  undo: [[523.25,0,.11,.014],[392,.075,.13,.014]],
  hint: [[523.25,0,.15,.018],[698.46,.11,.18,.020]],
  win: [[392,0,.20,.029],[523.25,.11,.23,.03],[659.25,.23,.25,.03],[783.99,.35,.27,.031]]
});

export function normalizeFeedback(value) {
  return FEEDBACK_TYPES.includes(value) ? value : 'idle';
}

/** Schedule one quiet cue using an AudioContext created by a real user gesture. */
export function playPrismCue(context, type) {
  const cue=CUES[normalizeFeedback(type)];
  if (!context || !cue || context.state==='closed' ||
      typeof context.createOscillator!=='function' || typeof context.createGain!=='function') return 0;
  const now=context.currentTime;
  for (const [pitch,offset,duration,volume] of cue) {
    const start=now+offset,end=start+duration;
    const oscillator=context.createOscillator(),gain=context.createGain();
    oscillator.type=type==='invalid'?'triangle':'sine';
    oscillator.frequency.setValueAtTime(pitch,start);
    gain.gain.setValueAtTime(.0001,start);
    gain.gain.linearRampToValueAtTime(volume,start+.016);
    gain.gain.exponentialRampToValueAtTime(.0001,end);
    oscillator.connect(gain);gain.connect(context.destination);
    oscillator.start(start);oscillator.stop(end+.01);
  }
  return cue.length;
}
