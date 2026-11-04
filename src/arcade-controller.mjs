/** Brandicade universal arcade input. UI-only: never reads or writes game saves. */
export const BUTTON_BINDINGS = Object.freeze({
  0: 'CONFIRM', 1: 'BACK', 2: 'SECONDARY', 3: 'ACHIEVEMENTS',
  4: 'PREV_TAB', 5: 'NEXT_TAB', 9: 'PAUSE',
  12: 'UP', 13: 'DOWN', 14: 'LEFT', 15: 'RIGHT'
});
export const DIRECTIONS = new Set(['UP', 'DOWN', 'LEFT', 'RIGHT']);

export function readGamepad(pad, deadzone = 0.58) {
  const actions = new Set();
  if (!pad || pad.connected === false || pad.mapping !== 'standard') return actions;
  for (const [index, action] of Object.entries(BUTTON_BINDINGS)) {
    if (pad.buttons?.[Number(index)]?.pressed) actions.add(action);
  }
  const x = Number(pad.axes?.[0]) || 0;
  const y = Number(pad.axes?.[1]) || 0;
  if (x <= -deadzone) actions.add('LEFT');
  if (x >= deadzone) actions.add('RIGHT');
  if (y <= -deadzone) actions.add('UP');
  if (y >= deadzone) actions.add('DOWN');
  // A digital D-pad takes precedence over a simultaneously deflected stick.
  if (actions.has('LEFT') && actions.has('RIGHT')) actions.delete('RIGHT');
  if (actions.has('UP') && actions.has('DOWN')) actions.delete('DOWN');
  return actions;
}

export function createRepeater({delay = 310, interval = 135} = {}) {
  const held = new Map();
  return {
    step(active, now) {
      const fired = [];
      for (const action of [...held.keys()]) if (!active.has(action)) held.delete(action);
      for (const action of active) {
        const next = held.get(action);
        if (next === undefined) {
          fired.push(action);
          held.set(action, now + delay);
        } else if (DIRECTIONS.has(action) && now >= next) {
          fired.push(action);
          held.set(action, now + interval);
        }
      }
      return fired;
    },
    reset() { held.clear(); }
  };
}

function center(rect) { return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}; }
/** Select a geometrically adjacent item; never activates it. */
export function spatialTarget(nodes, current, direction) {
  const origin = current?.getBoundingClientRect?.();
  if (!origin || origin.width <= 0 || origin.height <= 0) return nodes[0] || null;
  const start = center(origin);
  let best = null, score = Infinity;
  for (const candidate of nodes) {
    if (candidate === current) continue;
    const rect = candidate.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) continue;
    const at = center(rect), dx = at.x - start.x, dy = at.y - start.y;
    const primary = direction === 'LEFT' ? -dx : direction === 'RIGHT' ? dx : direction === 'UP' ? -dy : dy;
    if (primary <= 2) continue;
    const cross = direction === 'LEFT' || direction === 'RIGHT' ? Math.abs(dy) : Math.abs(dx);
    const rank = primary + 2.2 * cross + (cross > primary ? 80 : 0);
    if (rank < score) { best = candidate; score = rank; }
  }
  return best;
}

const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';
const NAV_PAGES = ['home', 'library', 'treasures', 'profile'];

export function startArcadeController({doc = document, win = window, nav = navigator} = {}) {
  const badge = doc.getElementById('controller-indicator');
  const legend = doc.getElementById('controller-legend');
  const pause = doc.getElementById('controller-pause');
  if (!badge || !legend || !pause || typeof win.requestAnimationFrame !== 'function') return () => {};
  const repeater = createRepeater();
  let running = true, connected = false, previousFocus = null;
  const activeSection = () => doc.querySelector('.section.active');
  const originalModal = () => doc.querySelector('#modal.open .dialog');
  const pauseOpen = () => !pause.hidden;
  const setConnection = (on) => {
    if (connected === on) return;
    connected = on;
    badge.hidden = !on;
    legend.hidden = !on;
    doc.body.classList.toggle('has-gamepad', on);
    repeater.reset();
  };
  const visible = (el) => !el?.disabled && !el?.closest('[hidden], [aria-hidden="true"], [inert]') &&
    (typeof el.getClientRects !== 'function' || el.getClientRects().length > 0);
  const scope = () => pauseOpen() ? pause : originalModal() || activeSection();
  const choices = (root = scope()) => root ? [...root.querySelectorAll(FOCUSABLE)].filter(visible) : [];
  const focus = (el) => {
    if (!el) return;
    el.focus({preventScroll: true});
    el.scrollIntoView?.({block: 'nearest', inline: 'nearest', behavior: 'instant'});
  };
  const ensureFocus = () => {
    const options = choices();
    if (options.includes(doc.activeElement)) return doc.activeElement;
    const primary = scope()?.querySelector('[data-action="play"], [data-action="continue"], [data-go="library"]');
    const first = primary && options.includes(primary) ? primary : options[0];
    focus(first);
    return null; // first A press establishes focus, never launches an unintended game
  };
  const openPause = () => {
    if (pauseOpen()) return;
    previousFocus = doc.activeElement;
    pause.hidden = false;
    focus(pause.querySelector('[data-controller-resume]'));
  };
  const closePause = () => {
    if (!pauseOpen()) return;
    pause.hidden = true;
    if (visible(previousFocus)) focus(previousFocus);
    previousFocus = null;
  };
  const changeTab = (step) => {
    const current = activeSection()?.id || 'home';
    const idx = NAV_PAGES.indexOf(current);
    const next = NAV_PAGES[(Math.max(0, idx) + step + NAV_PAGES.length) % NAV_PAGES.length];
    const button = doc.querySelector('.bottom-nav [data-go="'+next+'"]');
    button?.click();
    focus(button);
  };
  const move = (direction) => {
    if (activeSection()?.id === 'game' && !pauseOpen() && !originalModal()) {
      const cells = [...doc.querySelectorAll('#pop-board [data-cell]')].filter(visible);
      if (cells.length) {
        const current = cells.includes(doc.activeElement) ? doc.activeElement : null;
        if (!current) {focus(cells[0]); return;}
        const index = Number(current.dataset.cell), size = 7;
        const target = direction === 'LEFT' ? index - 1 : direction === 'RIGHT' ? index + 1 : direction === 'UP' ? index - size : index + size;
        if (target < 0 || target >= cells.length) return;
        if ((direction === 'LEFT' || direction === 'RIGHT') && Math.floor(target / size) !== Math.floor(index / size)) return;
        focus(cells.find(el => Number(el.dataset.cell) === target));
        return;
      }
    }
    const options = choices();
    const current = options.includes(doc.activeElement) ? doc.activeElement : null;
    if (!current) {ensureFocus(); return;}
    focus(spatialTarget(options, current, direction));
  };
  const act = (action) => {
    if (DIRECTIONS.has(action)) {move(action); return;}
    if (action === 'BACK') {
      if (pauseOpen()) {closePause(); return;}
      if (originalModal()) {doc.getElementById('modal-close')?.click(); return;}
      if (activeSection()?.id !== 'home') doc.querySelector('.bottom-nav [data-go="home"]')?.click();
      return;
    }
    if (action === 'PAUSE') {
      if (pauseOpen()) closePause();
      else if (originalModal()) doc.getElementById('modal-close')?.click();
      else if (activeSection()?.id === 'game') openPause();
      else doc.getElementById('settings-open')?.click();
      return;
    }
    if (action === 'CONFIRM') {
      const current = ensureFocus();
      if (current) current.click();
      return;
    }
    if (pauseOpen() || originalModal()) return;
    if (action === 'PREV_TAB') changeTab(-1);
    if (action === 'NEXT_TAB') changeTab(1);
    if (action === 'ACHIEVEMENTS') {
      const button = doc.querySelector('.bottom-nav [data-go="treasures"]');
      button?.click();focus(button);
    }
    if (action === 'SECONDARY' && activeSection()?.id === 'game') {
      doc.querySelector('#game [data-action="game-help"]')?.click();
    }
  };
  const onClick = (event) => {
    if (event.target.closest?.('[data-controller-resume]')) closePause();
    if (event.target.closest?.('[data-controller-exit]')) {
      closePause();
      doc.querySelector('#game [data-go="home"]')?.click();
    }
  };
  const onKey = (event) => {
    if (pauseOpen() && event.key === 'Escape') {
      event.preventDefault();event.stopImmediatePropagation();closePause();return;
    }
    if (event.key === 'Tab' && (pauseOpen() || originalModal())) {
      const options = choices(pauseOpen() ? pause : originalModal());
      if (!options.length) {event.preventDefault();return;}
      const pos = options.indexOf(doc.activeElement);
      if (event.shiftKey && pos <= 0) {event.preventDefault();focus(options[options.length - 1]);}
      else if (!event.shiftKey && pos === options.length - 1) {event.preventDefault();focus(options[0]);}
      return;
    }
    const direction = {ArrowUp:'UP', ArrowDown:'DOWN', ArrowLeft:'LEFT', ArrowRight:'RIGHT'}[event.key];
    if (!direction || event.altKey || event.ctrlKey || event.metaKey ||
      event.target?.matches?.('input, textarea, select, #pop-board [data-cell]')) return;
    event.preventDefault();move(direction);
  };
  const poll = (time) => {
    if (!running) return;
    if (doc.visibilityState !== 'hidden') {
      const pad = typeof nav.getGamepads === 'function' ? [...nav.getGamepads()].find(p => p && p.connected !== false && p.mapping === 'standard') : null;
      setConnection(Boolean(pad));
      for (const action of repeater.step(readGamepad(pad), time)) act(action);
    } else repeater.reset();
    win.requestAnimationFrame(poll);
  };
  pause.addEventListener('click', onClick);
  doc.addEventListener('keydown', onKey, true);
  win.requestAnimationFrame(poll);
  return () => {
    running = false;
    pause.removeEventListener('click', onClick);
    doc.removeEventListener('keydown', onKey, true);
    setConnection(false);
    closePause();
  };
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') startArcadeController();
