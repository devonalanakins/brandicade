/**
 * Prism Garden controller adapter.
 * Invokes the game's native, accessible buttons; it never reads or writes saves.
 * The Prism renderer owns puzzle rules, undo, awards, and recovery.
 */
import {readGamepad, createRepeater, spatialTarget, DIRECTIONS, chooseControllerAction} from '../arcade-controller.mjs';

const SELECTABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])';
const DEFAULT_ID = 'prism-gamepad-overlay';
const isVisible = (el) => Boolean(el && !el.disabled &&
  !el.closest?.('[hidden], [inert], [aria-hidden="true"]') &&
  (typeof el.getClientRects !== 'function' || el.getClientRects().length > 0));

/** Modal-aware focus list. Return only options in the active dialog, if any. */
export function prismControls(host, overlay) {
  const modal = overlay && !overlay.hidden ? overlay.querySelector('.pg-controller-panel') :
    host.querySelector('.pg-confirm[role="alertdialog"]');
  const scope = modal || host.querySelector('.pg-shell');
  return scope ? [...scope.querySelectorAll(SELECTABLE)].filter(isVisible) : [];
}

/** Prefer an actual jewel action before navigation or destructive controls. */
export function prismPreferred(host, overlay) {
  if (overlay && !overlay.hidden) return overlay.querySelector('[data-controller-resume]');
  const confirmation = host.querySelector('.pg-confirm[role="alertdialog"]');
  if (confirmation) return confirmation.querySelector('[data-action="cancel-run-change"]');
  if (host.querySelector('.pg-game')) {
    const target = host.querySelector('.pg-socket.target:not([disabled]), .pg-shelf-slot.target:not([disabled])');
    const selected = host.querySelector('.pg-stack.selected, .pg-shelf-slot.selected');
    if (target && selected) return target;
    return host.querySelector('.pg-stack:not([disabled]), .pg-shelf-slot:not([disabled]), .pg-socket:not([disabled])');
  }
  return host.querySelector('[data-action="continue"], [data-nav="atlas"], .pg-brand') ||
    host.querySelector('.pg-back');
}

export function startPrismController({doc = document, win = window, nav = navigator} = {}) {
  const host = doc.getElementById('prism-app');
  if (!host || !doc.body || typeof win.requestAnimationFrame !== 'function') return () => {};
  // A controller overlay lives outside the rerendered Prism app, so it cannot
  // corrupt selected jewels or disappear during a legal move.
  const indicator = doc.createElement('div');
  indicator.className = 'pg-controller-indicator';
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');
  indicator.textContent = 'Controller connected · A Select · B Back · Menu Pause';
  indicator.hidden = true;
  const overlay = doc.createElement('div');
  overlay.className = 'pg-controller-overlay';
  overlay.id = DEFAULT_ID;
  overlay.hidden = true;
  overlay.innerHTML = '<section class="pg-controller-panel" role="dialog" aria-modal="true" aria-labelledby="pg-controller-title">' +
    '<div class="pg-eyebrow">THE GARDEN WILL WAIT</div>' +
    '<h2 id="pg-controller-title">Paused</h2>' +
    '<p>Your puzzle stays exactly where it is. Nothing is reset.</p>' +
    '<button type="button" data-controller-resume>Resume puzzle · A</button>' +
    '<button type="button" data-controller-home>Return to Prism Garden</button></section>';
  doc.body.append(indicator, overlay);
  const repeat = createRepeater();
  let running = true, connected = false, restoreFocus = null;
  let pausedShell = null, pausedShellWasInert = false;
  const controls = () => prismControls(host, overlay);
  const focus = (el) => {
    if (!isVisible(el)) return false;
    el.focus({preventScroll: true});
    el.scrollIntoView?.({block: 'nearest', inline: 'nearest', behavior: 'instant'});
    return true;
  };
  const chosen = () => controls().includes(doc.activeElement) ? doc.activeElement : null;
  const ensureFocus = () => {
    const current = chosen();
    if (current) return current;
    const options = controls();
    const preferred = prismPreferred(host, overlay);
    focus(options.includes(preferred) ? preferred : options[0]);
    return null; // The first A establishes focus; it does not launch an unexpected action.
  };
  const afterAction = () => {
    // Prism Garden replaces its DOM after a move. Restore a meaningful focus
    // without faking clicks or changing puzzle state.
    if (!chosen()) {
      const options = controls(), preferred = prismPreferred(host, overlay);
      focus(options.includes(preferred) ? preferred : options[0]);
    }
  };
  const gameActive = () => Boolean(host.querySelector('.pg-game'));
  const confirmOpen = () => Boolean(host.querySelector('.pg-confirm[role="alertdialog"]'));
  const openPause = () => {
    if (!overlay.hidden || confirmOpen()) return;
    restoreFocus = doc.activeElement;
    // Overlay is outside #prism-app; inert the rendered game while paused.
    pausedShell = host.querySelector('.pg-shell');
    pausedShellWasInert = Boolean(pausedShell?.inert);
    if (pausedShell) pausedShell.inert = true;
    overlay.hidden = false;
    focus(overlay.querySelector('[data-controller-resume]'));
  };
  const closePause = () => {
    if (overlay.hidden) return;
    overlay.hidden = true;
    if (pausedShell) pausedShell.inert = pausedShellWasInert;
    pausedShell = null;
    if (isVisible(restoreFocus)) focus(restoreFocus);
    else afterAction();
    restoreFocus = null;
  };
  const safeClick = (el) => {
    if (!isVisible(el)) return false;
    el.click();
    afterAction();
    return true;
  };
  const move = (direction) => {
    const options = controls();
    const current = options.includes(doc.activeElement) ? doc.activeElement : null;
    if (!current) {ensureFocus();return;}
    focus(spatialTarget(options, current, direction));
  };
  const changeGroup = (step) => {
    const groups = [...host.querySelectorAll('.pg-mode-tabs button, .pg-home-links button, .pg-tools button')]
      .filter(isVisible);
    if (!groups.length) return;
    const i = groups.indexOf(doc.activeElement);
    focus(groups[(i < 0 ? (step > 0 ? 0 : groups.length - 1) : i + step + groups.length) % groups.length]);
  };
  const handle = (action) => {
    if (DIRECTIONS.has(action)) {move(action);return;}
    if (action === 'CONFIRM') {
      const current = ensureFocus();
      if (current) safeClick(current);
      return;
    }
    if (action === 'BACK') {
      if (!overlay.hidden) {closePause();return;}
      if (confirmOpen()) {safeClick(host.querySelector('[data-action="cancel-run-change"]'));return;}
      if (gameActive()) {
        if (safeClick(host.querySelector('.pg-clear-selection'))) return;
        safeClick(host.querySelector('.pg-game [data-nav="home"]'));
      } else if (host.querySelector('.pg-intro')) {
        safeClick(host.querySelector('.pg-back')); // Go back to Brandicade itself.
      } else safeClick(host.querySelector('.pg-brand'));
      return;
    }
    if (action === 'PAUSE') {
      if (!overlay.hidden) closePause();
      else if (gameActive() && !confirmOpen()) openPause();
      else if (!confirmOpen()) safeClick(host.querySelector('[data-nav="settings"]'));
      return;
    }
    if (!overlay.hidden || confirmOpen()) return;
    if (action === 'ACHIEVEMENTS') safeClick(host.querySelector('.pg-header-awards'));
    if (action === 'SECONDARY' && gameActive()) safeClick(host.querySelector('.pg-tools [data-action="undo"]'));
    if (action === 'PREV_TAB') changeGroup(-1);
    if (action === 'NEXT_TAB') changeGroup(1);
  };
  const onOverlayClick = (event) => {
    const node = event.target?.closest?.('button');
    if (node?.hasAttribute('data-controller-resume')) closePause();
    else if (node?.hasAttribute('data-controller-home')) {
      closePause();
      safeClick(host.querySelector('.pg-game [data-nav="home"]'));
    }
  };
  const onKey = (event) => {
    if (!overlay.hidden) {
      if (event.key === 'Escape') {
        event.preventDefault();event.stopImmediatePropagation?.();closePause();return;
      }
      if (event.key === 'Tab') {
        const options = controls();
        if (!options.length) {event.preventDefault();return;}
        const i = options.indexOf(doc.activeElement);
        if (event.shiftKey && i <= 0) {event.preventDefault();focus(options[options.length-1]);}
        else if (!event.shiftKey && (i === options.length-1 || i < 0)) {event.preventDefault();focus(options[0]);}
        return;
      }
    }
    if (event.altKey || event.ctrlKey || event.metaKey ||
      event.target?.matches?.('input,textarea,select')) return;
    const direction = {ArrowUp:'UP',ArrowDown:'DOWN',ArrowLeft:'LEFT',ArrowRight:'RIGHT'}[event.key];
    if (direction) {event.preventDefault();move(direction);}
  };
  const setConnection = (on) => {
    if (connected === on) return;
    connected = on;
    indicator.hidden = !on;
    doc.body.classList.toggle('pg-gamepad-active', on);
    repeat.reset();
  };
  const tick = (now) => {
    if (!running) return;
    if (doc.visibilityState !== 'hidden') {
      let pad = null;
      try {
        if (typeof nav.getGamepads === 'function') {
          pad = [...(nav.getGamepads() || [])].find(p => p && p.connected !== false && p.mapping === 'standard') || null;
        }
      } catch { /* If browser denies gamepad access, native input still works. */ }
      setConnection(Boolean(pad));
      if (connected) {
        const hint = !overlay.hidden ? 'Paused · A Resume · B Back' :
          confirmOpen() ? 'Keep playing · A Confirm · B Cancel' :
          gameActive() ? (host.querySelector('.pg-clear-selection') ?
            'Jewel selected · A Place · B Clear · X Undo' :
            'Choose a jewel · A Select · B Back · X Undo') :
            'Controller connected · A Select · B Back';
        if (indicator.textContent !== hint) indicator.textContent = hint;
      }
      const held = readGamepad(pad);
      const action = chooseControllerAction(repeat.step(held, now), held);
      if (action) handle(action);
    } else repeat.reset();
    win.requestAnimationFrame(tick);
  };
  overlay.addEventListener('click', onOverlayClick);
  doc.addEventListener('keydown', onKey, true);
  win.requestAnimationFrame(tick);
  return () => {
    running = false;
    closePause();
    overlay.removeEventListener('click', onOverlayClick);
    doc.removeEventListener('keydown', onKey, true);
    indicator.remove(); overlay.remove();
    doc.body.classList.remove('pg-gamepad-active');
  };
}
if (typeof document !== 'undefined' && typeof window !== 'undefined') startPrismController();
