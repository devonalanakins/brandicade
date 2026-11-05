/** Kahlua is the only illustrated character. This is a local, ephemeral greeting,
 * not an avatar picker, fake achievement, or persistent save mutation. */
export const KAHLUA_GREETINGS = Object.freeze([
  'Kahlua is here for the next adventure.',
  'Kahlua gives a curious head tilt. Pick any game you like.',
  'A little paw tap from Kahlua. The arcade is yours.',
  'Kahlua settles in beside you. No rush, no pressure.'
]);

export function startKahluaCompanion(doc = document) {
  const button = doc.getElementById('kahlua-greet');
  const response = doc.getElementById('kahlua-response');
  const stage = doc.getElementById('kahlua-stage');
  if (!button || !response || !stage) return () => {};
  let current = 0;
  const onGreet = () => {
    current = (current + 1) % KAHLUA_GREETINGS.length;
    response.textContent = KAHLUA_GREETINGS[current];
    stage.dataset.greeting = String(current % 2);
  };
  button.addEventListener('click', onGreet);
  return () => button.removeEventListener('click', onGreet);
}
if(typeof document !== 'undefined') startKahluaCompanion();
