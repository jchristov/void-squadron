import './style.css';
import { SpaceGame, type GameSnapshot } from './game';
import { SHIPS, type ShipClass } from './rules';

const app = document.querySelector<HTMLElement>('#app')!;
const canvas = document.querySelector<HTMLCanvasElement>('#space')!;
const arrow = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15M13 5l7 7-7 7" stroke="currentColor" stroke-width="1.5"/></svg>';
const emblem = '<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M20 4L35 33L20 25L5 33Z" stroke="currentColor" stroke-width="1.4"/><path d="M20 13v12M12 29l8 6 8-6" stroke="currentColor"/></svg>';
const shipIcon = (type: ShipClass) => {
  const shapes: Record<ShipClass, string> = {
    fighter: 'M32 6L38 27L57 37L57 43L37 38L32 51L27 38L7 43L7 37L26 27Z',
    interceptor: 'M32 4L39 30L53 15L58 43L36 39L32 55L28 39L6 43L11 15L25 30Z',
    bomber: 'M32 8L39 23L47 20L52 42L39 43L32 52L25 43L12 42L17 20L25 23Z',
    shuttle: 'M32 6L40 29L58 47L37 41L32 52L27 41L6 47L24 29Z',
    freighter: 'M23 10L40 10L45 20L52 25L52 44L40 48L24 48L12 44L12 25L20 20Z',
    destroyer: 'M32 5L55 44L48 49L16 49L9 44ZM32 18L40 38L24 38Z',
  };
  return `<svg viewBox="0 0 64 60" fill="none" aria-hidden="true"><path d="${shapes[type]}" stroke="currentColor" stroke-width="1.3"/><path d="M32 20v23M26 47v5M38 47v5" stroke="currentColor" opacity=".45"/></svg>`;
};
let selected: ShipClass = 'fighter';
let game: SpaceGame | undefined;
let latest: GameSnapshot | undefined;
let displayedMode = '';
let best = 0;
let muted = false;
let highQuality = true;
try { best = Number(localStorage.getItem('void-squadron-best')) || 0; } catch { /* Storage can be unavailable in private contexts. */ }

app.innerHTML = `
  <div class="screen-vignette" aria-hidden="true"></div><div class="film-grain" aria-hidden="true"></div>
  <header class="topbar flex items-center justify-between">
    <a class="brand flex items-center gap-3" href="#" aria-label="Void Squadron home">${emblem}<span>VOID<span class="brand-sub">SQUADRON</span></span></a>
    <div class="sector hidden md:flex items-center gap-3"><span class="status-dot"></span> OUTER FRONTIER <span class="separator">/</span> SECTOR 07</div>
    <div class="flex items-center gap-2"><button id="audio" class="icon-button" aria-label="Mute audio" title="Toggle audio">SOUND <span>ON</span></button><button id="quality" class="icon-button" aria-label="Switch to performance graphics" title="Toggle graphics quality">FX <span>HIGH</span></button><button id="pause-button" class="icon-button hidden" aria-label="Pause game">II</button></div>
  </header>
  <section id="menu" class="menu-screen">
    <div class="mission-copy">
      <div class="eyebrow flex items-center gap-3"><span class="tiny-line"></span> A SPACE COMBAT EXPERIENCE</div>
      <h1>THE VOID<br>IS <span>CALLING.</span></h1>
      <p class="intro">One pilot. An impossible frontier.<br>Take flight. Break the blockade. Make it back.</p>
      <div class="mission-meta flex gap-7"><div><span class="meta-label">OPERATION</span><strong>SHATTERED ORBIT</strong></div><div><span class="meta-label">THREAT LEVEL</span><strong class="amber">EXTREME <span class="threat-bars">▰▰▰▰▱</span></strong></div></div>
      <button id="launch" class="launch-button flex items-center justify-between"><span>LAUNCH MISSION</span>${arrow}</button>
      <div class="launch-hint">PRESS <kbd>ENTER</kbd> TO DEPLOY <span>•</span> FIVE WAVES. NO SECOND CHANCES.</div>
    </div>
    <div class="scene-tag"><span class="bracket">┌</span><div><span class="meta-label">HOSTILE CAPITAL SIGNATURE</span><strong>THE LEVIATHAN</strong><small>CLASS VII · BLOCKADE CARRIER</small></div></div>
    <div class="coordinate-label">07.24.89 N<br>119.06.42 E <span>◈</span></div>
    <div class="hangar">
      <div class="hangar-top flex items-center justify-between"><div class="flex items-center gap-3"><span class="section-index">01 /</span><h2>SELECT YOUR SPACECRAFT</h2></div><span class="hangar-note hidden md:block">SIX CLASSES. YOUR CALL.</span></div>
      <div id="ship-list" class="ship-list" role="group" aria-label="Select spacecraft">${(Object.keys(SHIPS) as ShipClass[]).map((key, i) => `<button class="ship-card ${key === selected ? 'selected' : ''}" data-ship="${key}" aria-pressed="${key === selected}"><span class="ship-number">0${i + 1}</span>${shipIcon(key)}<span class="ship-class">${key.toUpperCase()}</span><span class="ship-name">${SHIPS[key].name}</span><span class="selection-mark">${key === selected ? '● READY' : '○ AVAILABLE'}</span></button>`).join('')}</div>
      <div class="ship-details flex items-center justify-between"><p id="ship-description"></p><div class="ship-stats flex gap-5"><span>HULL <b id="ship-hull"></b></span><span>SPEED <b id="ship-speed"></b></span><span>ARMOR <b id="ship-armor"></b></span></div></div>
    </div>
    <footer class="menu-footer flex items-center justify-between"><span>ORIGINAL UNIVERSE <span class="separator">/</span> REAL-TIME 3D</span><button id="controls-open" class="text-button">FLIGHT MANUAL ↗</button><span>PERSONAL BEST <b id="best">${best.toLocaleString()}</b></span></footer>
  </section>
  <section id="hud" class="hidden" aria-label="Combat status">
    <div class="hud-mission"><span class="eyebrow">OPERATION SHATTERED ORBIT</span><h2>BREAK THE BLOCKADE</h2><div class="flex gap-5"><span>WAVE <b id="wave">01</b> / 05</span><span>HOSTILES <b id="enemies">0</b></span></div></div>
    <div class="hud-score"><span class="meta-label">COMBAT SCORE</span><strong id="score">000000</strong><span id="combo" class="amber"></span></div>
    <div class="reticle" aria-hidden="true"><span></span><i></i></div>
    <div id="message" class="combat-message" role="status" aria-live="polite"></div>
    <div class="hud-bottom"><div class="systems"><span class="eyebrow" id="pilot-ship"></span><div class="system-row"><span>SHIELD</span><div class="meter"><i id="shield-bar"></i></div><b id="shield-value">100</b></div><div class="system-row hull"><span>HULL</span><div class="meter"><i id="hull-bar"></i></div><b id="hull-value">100</b></div></div><div class="flight-hints hidden md:flex"><span><kbd>W A S D</kbd> / MOUSE · STEER</span><span><kbd>SPACE</kbd> / CLICK · FIRE</span><span><kbd>SHIFT</kbd> · BOOST</span><span><kbd>ESC</kbd> · PAUSE</span></div><div class="boost-system"><span class="meta-label">ENGINE OUTPUT</span><strong><span id="speed">0</span><small> M/S</small></strong><div class="meter boost"><i id="energy-bar"></i></div></div></div>
    <div id="damage-flash" aria-hidden="true"></div>
  </section>
  <section id="pause" class="overlay hidden" aria-labelledby="pause-title"><div class="modal"><span class="eyebrow">FLIGHT SYSTEMS ON STANDBY</span><h2 id="pause-title">HOLDING<br><span>POSITION.</span></h2><p>Take a breath, pilot. The frontier can wait.</p><button id="resume" class="launch-button flex items-center justify-between">RESUME FLIGHT ${arrow}</button><button id="abort" class="secondary-button">RETURN TO HANGAR</button></div></section>
  <section id="results" class="overlay hidden" aria-labelledby="result-title"><div class="modal"><span id="result-eyebrow" class="eyebrow"></span><h2 id="result-title"></h2><p id="result-copy"></p><div class="result-stats flex justify-between"><div><span class="meta-label">FINAL SCORE</span><strong id="final-score"></strong></div><div><span class="meta-label">CONFIRMED KILLS</span><strong id="final-kills"></strong></div></div><button id="retry" class="launch-button flex items-center justify-between">DEPLOY AGAIN ${arrow}</button><button id="return" class="secondary-button">RETURN TO HANGAR</button></div></section>
  <dialog id="manual"><form method="dialog"><button class="dialog-close" aria-label="Close flight manual">×</button><span class="eyebrow">PILOT BRIEFING / 07</span><h2>FLIGHT MANUAL</h2><p>Survive five waves to break the blockade. Destroy hostile spacecraft for points, or evade them as they pass. Bigger ships hit harder; lighter ships are faster.</p><dl><dt>MOUSE / WASD / ARROWS</dt><dd>Steer your spacecraft across the flight corridor.</dd><dt>CLICK / SPACE</dt><dd>Hold to fire your primary cannons.</dd><dt>SHIFT</dt><dd>Boost. Energy replenishes when released.</dd><dt>P / ESC</dt><dd>Pause or resume your mission.</dd></dl><div class="manual-warning"><strong>WATCH YOUR VECTOR.</strong><p>Asteroid impacts scale with relative speed, mass, and armor. Shields absorb damage first. Shields regenerate after a quiet interval — hull damage is permanent.</p></div><p class="small-copy">On touchscreens, drag on the space view to steer and fire. Desktop keyboard and mouse recommended.</p><button class="secondary-button">UNDERSTOOD</button></form></dialog>
`;
const el = (id: string) => document.getElementById(id)!;
const text = (id: string, value: string | number) => { const target = el(id); const next = String(value); if (target.textContent !== next) target.textContent = next; };
const show = (id: string, visible: boolean) => el(id).classList.toggle('hidden', !visible);
function shipDetails() {
  const ship = SHIPS[selected];
  text('ship-description', ship.description);
  text('ship-hull', ship.hull); text('ship-speed', ship.speed); text('ship-armor', ship.armor);
  document.querySelectorAll<HTMLButtonElement>('[data-ship]').forEach(button => {
    const active = button.dataset.ship === selected;
    button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active));
    button.querySelector('.selection-mark')!.textContent = active ? '● READY' : '○ AVAILABLE';
  });
}
shipDetails();
function launch() { el('manual').hasAttribute('open') && (el('manual') as HTMLDialogElement).close(); game?.start(selected); }
function update(state: GameSnapshot) {
  const previous = latest;
  latest = state;
  if (displayedMode !== state.mode) {
    displayedMode = state.mode;
    show('menu', state.mode === 'menu'); show('hud', state.mode === 'playing' || state.mode === 'paused');
    show('pause', state.mode === 'paused'); show('results', state.mode === 'ended'); show('pause-button', state.mode === 'playing');
    document.body.dataset.mode = state.mode;
    if (state.mode === 'paused') el('resume').focus();
    if (state.mode === 'menu') { text('best', best.toLocaleString()); el('launch').focus({ preventScroll: true }); }
    if (state.mode === 'ended') {
      const won = state.result === 'victory';
      text('result-eyebrow', won ? 'BLOCKADE BROKEN / MISSION COMPLETE' : 'SIGNAL LOST / MISSION ENDED');
      el('result-title').innerHTML = won ? 'FRONTIER<br><span>LIBERATED.</span>' : 'LOST TO<br><span>THE VOID.</span>';
      text('result-copy', won ? 'You made the impossible look inevitable. Welcome home, pilot.' : 'Every legend starts with another attempt. Your squadron awaits.');
      text('final-score', state.score.toLocaleString()); text('final-kills', state.kills);
      best = Math.max(best, state.score);
      try { localStorage.setItem('void-squadron-best', String(best)); } catch { /* The game remains playable without persistence. */ }
      el('retry').focus();
    }
  }
  const ship = SHIPS[state.ship];
  text('wave', String(state.wave).padStart(2, '0')); text('enemies', state.enemies);
  text('score', String(state.score).padStart(6, '0')); text('combo', state.combo > 1 ? `${state.combo}× CHAIN` : '');
  text('shield-value', Math.ceil(state.shield)); text('hull-value', Math.ceil(state.hull));
  el('shield-bar').style.width = `${ship.shield > 0 ? Math.max(0, state.shield / ship.shield * 100) : 0}%`;
  el('hull-bar').style.width = `${Math.max(0, state.hull / ship.hull * 100)}%`;
  el('energy-bar').style.width = `${Math.max(0, state.energy)}%`;
  text('speed', Math.round(state.speed)); text('message', state.message); text('pilot-ship', `${ship.name} / ${state.ship.toUpperCase()}`);
  el('hull-bar').classList.toggle('critical', state.hull < ship.hull * .25);
  if (previous && state.mode === 'playing' && (state.hull < previous.hull || state.shield < previous.shield)) {
    el('damage-flash').classList.remove('hit'); void el('damage-flash').offsetWidth; el('damage-flash').classList.add('hit');
  }
}
try { game = new SpaceGame(canvas, update); }
catch (error) {
  el('launch').textContent = '3D GRAPHICS UNAVAILABLE'; (el('launch') as HTMLButtonElement).disabled = true;
  const hint = document.querySelector('.launch-hint');
  if (hint) hint.textContent = 'Enable WebGL / hardware acceleration, then reload this page.';
  console.error('Unable to initialize the 3D renderer:', error);
}
el('launch').addEventListener('click', launch); el('retry').addEventListener('click', launch);
el('resume').addEventListener('click', () => game?.resume());
for (const id of ['abort', 'return']) el(id).addEventListener('click', () => game?.returnToMenu());
el('pause-button').addEventListener('click', () => game?.pause());
el('ship-list').addEventListener('click', event => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-ship]'); if (button) { selected = button.dataset.ship as ShipClass; shipDetails(); } });
el('audio').addEventListener('click', () => { muted = !muted; game?.setMuted(muted); el('audio').innerHTML = `SOUND <span>${muted ? 'OFF' : 'ON'}</span>`; el('audio').setAttribute('aria-label', muted ? 'Enable audio' : 'Mute audio'); });
el('quality').addEventListener('click', () => { highQuality = !highQuality; game?.setQuality(highQuality); el('quality').innerHTML = `FX <span>${highQuality ? 'HIGH' : 'LOW'}</span>`; el('quality').setAttribute('aria-label', highQuality ? 'Switch to performance graphics' : 'Switch to high graphics'); });
el('controls-open').addEventListener('click', () => (el('manual') as HTMLDialogElement).showModal());
document.querySelector('.brand')!.addEventListener('click', event => { event.preventDefault(); if (latest?.mode === 'playing') game?.pause(); });
window.addEventListener('keydown', event => {
  if ((el('manual') as HTMLDialogElement).open) return;
  if (event.repeat) return;
  if (event.code === 'Enter' && (!latest || latest.mode === 'menu') && event.target === document.body) { event.preventDefault(); launch(); }
  if (event.code === 'Escape' || event.code === 'KeyP') {
    if (latest?.mode === 'playing') { event.preventDefault(); game?.pause(); }
    else if (latest?.mode === 'paused') { event.preventDefault(); game?.resume(); }
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && latest?.mode === 'playing') game?.pause(); });
window.addEventListener('pagehide', event => { if (!event.persisted) game?.dispose(); else game?.pause(); });
if (import.meta.hot) import.meta.hot.dispose(() => game?.dispose());
