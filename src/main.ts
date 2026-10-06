import './style.css';
import { SpaceGame, type GameSnapshot } from './game';
import { SHIPS, type ShipClass } from './rules';
import { relativeRadarPosition, projectRadarContact } from './radar';
import { formatSpaceDistance } from './units';
import { UPGRADE_MAX_LEVEL, getUpgradedShipStats, type UpgradeLevels } from './upgrades';

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
let collisionBoundsVisible = false;
let radarRange = 1000;
let difficulty: 'relaxed' | 'standard' | 'veteran' = 'standard';
let collisionsEnabled = true;
let damageEnabled = true;
let mouseCaptureEnabled = false;
let mouseSensitivity = 1;
type SettingsEngine = SpaceGame & {
  setCollisionsEnabled?: (enabled: boolean) => void;
  setDamageEnabled?: (enabled: boolean) => void;
  setDifficulty?: (difficulty: 'relaxed' | 'standard' | 'veteran') => void;
  setMouseCaptureEnabled?: (enabled: boolean) => void;
  requestMouseCapture?: () => void;
};
try { best = Number(localStorage.getItem('void-squadron-best')) || 0; } catch { /* Storage can be unavailable in private contexts. */ }

app.innerHTML = `
  <div class="screen-vignette" aria-hidden="true"></div><div class="film-grain" aria-hidden="true"></div>
  <header class="topbar flex items-center justify-between">
    <a class="brand flex items-center gap-3" href="#" aria-label="Void Squadron home">${emblem}<span>VOID<span class="brand-sub">SQUADRON</span></span></a>
    <div class="sector hidden md:flex items-center gap-3"><span class="status-dot"></span> OUTER FRONTIER <span class="separator">/</span> SECTOR 07</div>
    <div class="flex items-center gap-2"><button id="audio" class="icon-button" aria-label="Mute audio" title="Toggle audio">SOUND <span>ON</span></button><button id="quality" class="icon-button" aria-label="Switch to performance graphics" title="Toggle graphics quality">FX <span>HIGH</span></button><button id="settings-open" class="icon-button" aria-label="Open game settings">SETTINGS</button><button id="bounds" class="icon-button" aria-label="Show collision bounds" aria-pressed="false" title="Toggle collision sphere visualization">BOUNDS <span>OFF</span></button><button id="pause-button" class="icon-button hidden" aria-label="Pause game">II</button></div>
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
      <div id="selection-feedback" class="selection-feedback" role="status" aria-live="polite">Vanguard Fighter selected — ready to launch</div><div class="ship-details flex items-center justify-between"><p id="ship-description"></p><div class="ship-stats flex gap-5"><span>HULL <b id="ship-hull"></b></span><span>SPEED <b id="ship-speed"></b> KM/S</span><span>ARMOR <b id="ship-armor"></b></span></div></div>
      <button id="deploy-selected" class="launch-button flex items-center justify-between"><span>DEPLOY SELECTED SHIP</span>${arrow}</button>
    </div>
    <footer class="menu-footer flex items-center justify-between"><span>ORIGINAL UNIVERSE <span class="separator">/</span> REAL-TIME 3D</span><button id="controls-open" class="text-button">FLIGHT MANUAL ↗</button><span>PERSONAL BEST <b id="best">${best.toLocaleString()}</b></span></footer>
  </section>
  <section id="hud" class="hidden" aria-label="Combat status">
    <div class="hud-mission"><span class="eyebrow">OPERATION SHATTERED ORBIT</span><h2>BREAK THE BLOCKADE</h2><div class="flex gap-5"><span>WAVE <b id="wave">01</b> / 05</span><span>HOSTILES <b id="enemies">0</b></span></div></div>
    <div class="hud-score"><span class="meta-label">COMBAT SCORE</span><strong id="score">000000</strong><span id="combo" class="amber"></span></div>
    <div class="reticle" aria-hidden="true"><span></span><i></i></div>
    <aside class="upgrade-panel" aria-label="Permanent spacecraft upgrades"><div class="upgrade-title">PERMANENT UPGRADES <span>THIS SHIP</span></div><div class="upgrade-row"><span>HULL</span><div class="upgrade-track"><i id="upgrade-hull-bar"></i></div><b id="upgrade-hull-level">0 / 10</b></div><div class="upgrade-row"><span>DEFENSE</span><div class="upgrade-track"><i id="upgrade-defense-bar"></i></div><b id="upgrade-defense-level">0 / 10</b></div><div class="upgrade-row"><span>ATTACK</span><div class="upgrade-track"><i id="upgrade-attack-bar"></i></div><b id="upgrade-attack-level">0 / 10</b></div><div class="upgrade-effects" id="upgrade-effects"></div></aside>
    <div id="boss-banner" class="boss-banner hidden" role="alert" aria-live="assertive"><span id="boss-banner-kicker"></span><strong id="boss-banner-title"></strong><small id="boss-banner-copy"></small></div>
    <aside id="boss-card" class="boss-card hidden" aria-label="Capital ship status"><div class="boss-head"><span id="boss-name">THE LEVIATHAN</span><em id="boss-phase" class="boss-phase">SHIELDED</em><b id="boss-pct">100%</b></div><div class="boss-bar shield"><i id="boss-shield-bar"></i></div><div class="boss-bar hull"><i id="boss-hull-bar"></i></div><div class="boss-chips" id="boss-chips"></div></aside>
    <div id="capture-indicator" class="capture-indicator">M · MOUSE FREE</div>
    <div id="message" class="combat-message" role="status" aria-live="polite"></div>
    <div class="hud-bottom"><div class="systems"><span class="eyebrow" id="pilot-ship"></span><div class="system-row"><span>SHIELD</span><div class="meter"><i id="shield-bar"></i></div><b id="shield-value">100</b></div><div class="system-row hull"><span>HULL</span><div class="meter"><i id="hull-bar"></i></div><b id="hull-value">100</b></div></div><div class="flight-hints hidden md:flex"><span>MOUSE / <kbd>W A S D</kbd> · YAW / PITCH</span><span>WHEEL / <kbd>Q E</kbd> · ROLL</span><span><kbd>SPACE</kbd> / CLICK · FIRE</span><span><kbd>SHIFT</kbd> · BOOST</span><span><kbd>ESC</kbd> · PAUSE</span></div><div class="boost-system"><span class="meta-label">ENGINE OUTPUT</span><strong><span id="speed">0</span><small> KM/S</small></strong><div class="meter boost"><i id="energy-bar"></i></div></div></div>
    <aside class="radar-panel" aria-label="Tactical radar"><div class="radar-heading"><span>TACTICAL SCANNER</span><b id="radar-scale">1,000 KM</b></div><canvas id="radar" width="360" height="360" aria-label="Ship-relative contact map"></canvas><div class="radar-zoom"><button id="radar-in" aria-label="Zoom radar in">+</button><span id="radar-range" role="status">SCANNING CONTACTS</span><button id="radar-out" aria-label="Zoom radar out">−</button></div><div class="radar-legend"><span class="hostile">◆ HOSTILE</span><span class="neutral">◇ BONUS</span><span class="pickup">+ SUPPLY</span><span class="boss">■ CAPITAL</span></div><div class="radar-caption">TOP: AHEAD · BOTTOM: BEHIND · ▲/▼: ALTITUDE</div></aside>
    <div id="recovery-status" class="recovery-status" role="status" aria-live="polite"></div>
    <div id="damage-flash" aria-hidden="true"></div>
  </section>
  <section id="pause" class="overlay hidden" aria-labelledby="pause-title"><div class="modal"><span class="eyebrow">FLIGHT SYSTEMS ON STANDBY</span><h2 id="pause-title">HOLDING<br><span>POSITION.</span></h2><p>Take a breath, pilot. The frontier can wait.</p><button id="resume" class="launch-button flex items-center justify-between">RESUME FLIGHT ${arrow}</button><button id="abort" class="secondary-button">RETURN TO HANGAR</button></div></section>
  <section id="results" class="overlay hidden" aria-labelledby="result-title"><div class="modal"><span id="result-eyebrow" class="eyebrow"></span><h2 id="result-title"></h2><p id="result-copy"></p><div class="result-stats flex justify-between"><div><span class="meta-label">FINAL SCORE</span><strong id="final-score"></strong></div><div><span class="meta-label">CONFIRMED KILLS</span><strong id="final-kills"></strong></div></div><button id="retry" class="launch-button flex items-center justify-between">DEPLOY AGAIN ${arrow}</button><button id="return" class="secondary-button">RETURN TO HANGAR</button></div></section>
  <dialog id="settings"><form method="dialog"><button class="dialog-close" aria-label="Close game settings">×</button><span class="eyebrow">FLIGHT CONFIGURATION</span><h2>GAME SETTINGS</h2><label class="setting-row" for="difficulty"><span>DIFFICULTY<small>Enemy aggression and recovery generosity</small></span><select id="difficulty"><option value="relaxed">Relaxed</option><option value="standard" selected>Standard</option><option value="veteran">Veteran</option></select></label><label class="setting-row" for="collisions-setting"><span>PHYSICAL COLLISIONS<small>Spacecraft, asteroids, planets and carriers</small></span><input id="collisions-setting" type="checkbox" checked></label><label class="setting-row" for="damage-setting"><span>PLAYER DAMAGE<small>Off: your hull and shields ignore incoming damage</small></span><input id="damage-setting" type="checkbox" checked></label><label class="setting-row" for="capture-setting"><span>CAPTURE MOUSE<small>Lock and hide cursor during flight; Escape releases it</small></span><input id="capture-setting" type="checkbox"></label><label class="setting-row sensitivity-row" for="mouse-sensitivity"><span>CAPTURE SENSITIVITY<small>Relative mouse steering only · M toggles capture</small></span><div class="sensitivity-control"><output id="sensitivity-value" for="mouse-sensitivity">1.00×</output><input id="mouse-sensitivity" type="range" min="0.25" max="3" step="0.05" value="1" aria-label="Captured mouse sensitivity"></div></label><p class="small-copy">Collisions and player damage are independent. Disabling damage keeps your weapons and power-up collection active. Mouse capture begins on Launch or Resume, with browser permission.</p><button class="secondary-button">APPLY & CLOSE</button></form></dialog>
  <dialog id="manual"><form method="dialog"><button class="dialog-close" aria-label="Close flight manual">×</button><span class="eyebrow">PILOT BRIEFING / 07</span><h2>FLIGHT MANUAL</h2><p>Clear combat hostiles across five waves. Fighters make attack passes, interceptors chase aggressively, and heavier warships turn slowly. Shuttles and freighters flee without firing: optional bonus targets, not mission blockers. Fly away to break pursuit and recover using shield, energy, and hull-repair supplies.</p><dl><dt>MOUSE / WASD / ARROWS</dt><dd>Yaw and pitch your ship. Point your nose where you want to fly; thrust carries you forward in that direction.</dd><dt>SCROLL WHEEL / Q / E</dt><dd>Roll around your ship’s forward axis. Your chase camera banks with you.</dd><dt>M / MOUSE CAPTURE</dt><dd>Toggle cursor capture. Adjust capture sensitivity from 0.25× to 3× in Settings. Escape releases capture and pauses.</dd><dt>CLICK / SPACE</dt><dd>Hold to fire your primary cannons.</dd><dt>SHIFT</dt><dd>Boost. Energy replenishes when released.</dd><dt>P / ESC</dt><dd>Pause or resume your mission.</dd><dt>TACTICAL RADAR</dt><dd>Red diamonds: combat hostiles. Amber outlines: optional fleeing ships. Cyan crosses: supplies. Use + / − to zoom from 250 to 8,000 km. Top is ahead; bottom is behind. ▲ / ▼ indicate relative altitude. Distant contacts stay on the radar edge.</dd><dt>BOUNDS</dt><dd>Optional collision-sphere visualization. Off by default; impact flashes appear on spacecraft surfaces.</dd></dl><div class="manual-warning"><strong>WATCH YOUR VECTOR.</strong><p>Asteroid impacts scale with relative speed, mass, and armor. Shields absorb damage first. Shields regenerate after a quiet interval — hull damage is permanent.</p></div><p class="small-copy">On touchscreens, drag on the space view to steer and fire. Desktop keyboard and mouse recommended.</p><button class="secondary-button">UNDERSTOOD</button></form></dialog>
`;
const el = (id: string) => document.getElementById(id)!;
const text = (id: string, value: string | number) => { const target = el(id); const next = String(value); if (target.textContent !== next) target.textContent = next; };
const show = (id: string, visible: boolean) => el(id).classList.toggle('hidden', !visible);
function shipDetails() {
  const levels = game?.getShipUpgradeLevels(selected) ?? { hull: 0, defense: 0, attack: 0 };
  const ship = getUpgradedShipStats(SHIPS[selected], levels);
  text('ship-description', ship.description);
  text('ship-hull', ship.hull); text('ship-speed', ship.speed); text('ship-armor', ship.armor);
  text('selection-feedback', `${ship.name} · HULL ${levels.hull}/${UPGRADE_MAX_LEVEL} · DEF ${levels.defense}/${UPGRADE_MAX_LEVEL} · ATK ${levels.attack}/${UPGRADE_MAX_LEVEL}`);
  document.querySelectorAll<HTMLButtonElement>('[data-ship]').forEach(button => {
    const active = button.dataset.ship === selected;
    button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active));
    button.querySelector('.selection-mark')!.textContent = active ? '● READY' : '○ AVAILABLE';
  });
}
shipDetails();
function applySettings() {
  const engine = game as SettingsEngine | undefined;
  engine?.setDifficulty?.(difficulty);
  engine?.setCollisionsEnabled?.(collisionsEnabled);
  engine?.setDamageEnabled?.(damageEnabled);
  game?.setMouseSensitivity(mouseSensitivity);
  engine?.setMouseCaptureEnabled?.(mouseCaptureEnabled);
}
function launch() {
  (el('manual') as HTMLDialogElement).close();
  (el('settings') as HTMLDialogElement).close();
  applySettings();
  game?.start(selected);
}
function drawRadar() {
  if (!game) return;
  const telemetry = game.getFlightTelemetry();
  const ctx = (el('radar') as HTMLCanvasElement).getContext('2d');
  if (!ctx) return;
  const center = 180, radius = 145;
  ctx.clearRect(0, 0, 360, 360);
  ctx.fillStyle = '#07141ce8'; ctx.beginPath(); ctx.arc(center, center, radius, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#83e5e730'; ctx.lineWidth = 1;
  for (const scale of [0.33, 0.66, 1]) { ctx.beginPath(); ctx.arc(center, center, radius * scale, 0, Math.PI * 2); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(center - radius, center); ctx.lineTo(center + radius, center); ctx.moveTo(center, center - radius); ctx.lineTo(center, center + radius); ctx.stroke();
  ctx.fillStyle = '#83e5e7'; ctx.beginPath(); ctx.moveTo(center, center - 9); ctx.lineTo(center + 5, center + 6); ctx.lineTo(center - 5, center + 6); ctx.closePath(); ctx.fill();
  let nearest = Infinity;
  const contacts: { position: { x: number; y: number; z: number }; kind: 'hostile' | 'neutral' | 'pickup' | 'boss' | 'system' }[] = telemetry.enemies.map(enemy => ({position: enemy.position, kind: enemy.ship === 'shuttle' || enemy.ship === 'freighter' ? 'neutral' : 'hostile'}));
  const bossTelemetry = telemetry.boss && !telemetry.boss.defeated ? telemetry.boss : null;
  if (bossTelemetry) {
    contacts.push({ position: bossTelemetry.position, kind: 'boss' });
    bossTelemetry.subsystems.filter(sub => !sub.destroyed).forEach(sub => contacts.push({ position: sub.position, kind: 'system' }));
  }
  const supplies = (telemetry as typeof telemetry & { pickups?: readonly {position: {x:number;y:number;z:number}}[] }).pickups;
  supplies?.forEach(pickup => contacts.push({position:pickup.position,kind:'pickup'}));
  for (const contact of contacts) {
    const local = relativeRadarPosition(contact.position, telemetry.player.position, telemetry.player.orientation);
    const projected = projectRadarContact(local, radarRange);
    if (contact.kind === 'hostile' || contact.kind === 'boss') nearest = Math.min(nearest, projected.distance);
    const x = center + projected.x * radius, y = center + projected.y * radius;
    ctx.globalAlpha = projected.edge ? .65 : 1;
    ctx.strokeStyle = ctx.fillStyle = contact.kind === 'hostile' ? '#ff776c' : contact.kind === 'neutral' ? '#ffbf69' : contact.kind === 'boss' || contact.kind === 'system' ? '#ff4fa3' : '#83e5e7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (contact.kind === 'boss') { ctx.lineWidth = 2.5; ctx.strokeRect(x - 9, y - 9, 18, 18); ctx.fillRect(x - 4, y - 4, 8, 8); continue; }
    if (contact.kind === 'system') { ctx.fillRect(x - 2, y - 2, 4, 4); continue; }
    if (contact.kind === 'pickup') { ctx.moveTo(x-4,y);ctx.lineTo(x+4,y);ctx.moveTo(x,y-4);ctx.lineTo(x,y+4);ctx.stroke(); }
    else { ctx.moveTo(x,y-5);ctx.lineTo(x+5,y);ctx.lineTo(x,y+5);ctx.lineTo(x-5,y);ctx.closePath();if(contact.kind==='hostile')ctx.fill();else ctx.stroke(); }
    if (Math.abs(local.y)>35) {ctx.font='14px monospace';ctx.fillText(local.y>0?'▲':'▼',x+7,y+4);}
  }
  ctx.globalAlpha = 1;
  text('radar-range', Number.isFinite(nearest) ? `NEAREST HOSTILE ${formatSpaceDistance(nearest)}` : 'NO COMBAT CONTACTS');
}
let bossBannerTimer = 0;
function hideBossBanner() { window.clearTimeout(bossBannerTimer); el('boss-banner').classList.add('hidden'); }
function showBossBanner(kicker: string, title: string, copy: string, tone: 'alert' | 'critical') {
  const banner = el('boss-banner');
  text('boss-banner-kicker', kicker); text('boss-banner-title', title); text('boss-banner-copy', copy);
  banner.dataset.tone = tone;
  banner.classList.remove('hidden', 'play'); void banner.offsetWidth; banner.classList.add('play');
  window.clearTimeout(bossBannerTimer);
  bossBannerTimer = window.setTimeout(() => banner.classList.add('hidden'), 4600);
}
function update(state: GameSnapshot) {
  const previous = latest;
  latest = state;
  if (displayedMode !== state.mode) {
    displayedMode = state.mode;
    show('menu', state.mode === 'menu'); show('hud', state.mode === 'playing' || state.mode === 'paused');
    show('pause', state.mode === 'paused'); show('results', state.mode === 'ended'); show('pause-button', state.mode === 'playing');
    document.body.dataset.mode = state.mode;
    if (state.mode === 'paused') el('resume').focus();
    if (state.mode === 'menu') { shipDetails(); text('best', best.toLocaleString()); el('launch').focus({ preventScroll: true }); }
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
  if (state.mode === 'playing' || state.mode === 'paused') drawRadar();
  text('capture-indicator', state.captureActive ? `M · MOUSE CAPTURED · ${mouseSensitivity.toFixed(2)}×` : 'M · MOUSE FREE');
  el('capture-indicator').classList.toggle('captured', Boolean(state.captureActive));
  el('settings-open').setAttribute('title', `${state.difficulty || difficulty} difficulty · mouse ${state.captureActive ? 'captured' : 'free'}`);
  const recovery = state as GameSnapshot & { recovery?: boolean; pickupMessage?: string };
  text('recovery-status', recovery.pickupMessage || (recovery.recovery ? 'DISENGAGED · RECOVERY ZONE' : ''));
  const levels: UpgradeLevels = state.upgrades;
  for (const key of ['hull', 'defense', 'attack'] as const) {
    el(`upgrade-${key}-bar`).style.width = `${levels[key] / UPGRADE_MAX_LEVEL * 100}%`;
    text(`upgrade-${key}-level`, `${levels[key]} / ${UPGRADE_MAX_LEVEL}`);
  }
  text('upgrade-effects', `HULL ${state.maxHull} · SHIELD ${state.maxShield} · DAMAGE ${state.attackDamage}`);
  const ship = { ...SHIPS[state.ship], hull: state.maxHull, shield: state.maxShield };
  const boss = state.boss;
  if (boss && !previous?.boss) showBossBanner('WARNING · CAPITAL SIGNATURE', boss.name.toUpperCase(), 'Class VII blockade carrier. Destroy both shield domes, then strike the command bridge.', 'alert');
  else if (boss && previous?.boss && boss.phase !== previous.boss.phase) {
    if (boss.phase === 'exposed') showBossBanner('SHIELDS COLLAPSED', 'BRIDGE EXPOSED', 'Command tower is vulnerable — strike now. Turret fire intensifies.', 'alert');
    else if (boss.phase === 'critical') showBossBanner('HULL CRITICAL', 'FINISH IT', 'The Leviathan is venting. Its batteries are firing at full tempo.', 'critical');
  }
  if (!boss) hideBossBanner();
  show('boss-card', Boolean(boss) && state.mode !== 'ended');
  if (boss) {
    text('boss-name', boss.name.toUpperCase());
    text('boss-phase', ({ shielded: 'SHIELDED', exposed: 'SHIELDS DOWN', critical: 'CRITICAL', defeated: 'DESTROYED' } as const)[boss.phase]);
    el('boss-phase').dataset.phase = boss.phase;
    text('boss-pct', `${Math.round((boss.hull + boss.shield) / (boss.maxHull + boss.maxShield) * 100)}%`);
    el('boss-shield-bar').style.width = `${boss.shield / boss.maxShield * 100}%`;
    el('boss-hull-bar').style.width = `${boss.hull / boss.maxHull * 100}%`;
    const chips = boss.subsystems.map(sub => `<span class="boss-chip ${sub.destroyed ? 'down' : ''}" title="${sub.name}"><em>${sub.name.replace(/ (Shield Dome|Flight Deck|Bridge Tower)/, m => ({ ' Shield Dome': ' DOME', ' Flight Deck': ' DECK', ' Bridge Tower': ' BRIDGE' } as Record<string, string>)[m]).toUpperCase()}</em><i style="width:${sub.destroyed ? 0 : sub.hull / sub.maxHull * 100}%"></i></span>`).join('');
    if (el('boss-chips').innerHTML !== chips) el('boss-chips').innerHTML = chips;
  }
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
try { game = new SpaceGame(canvas, update); shipDetails(); }
catch (error) {
  el('launch').textContent = '3D GRAPHICS UNAVAILABLE'; (el('launch') as HTMLButtonElement).disabled = true;
  const hint = document.querySelector('.launch-hint');
  if (hint) hint.textContent = 'Enable WebGL / hardware acceleration, then reload this page.';
  console.error('Unable to initialize the 3D renderer:', error);
}
el('launch').addEventListener('click', launch); el('deploy-selected').addEventListener('click', launch); el('retry').addEventListener('click', launch);
el('resume').addEventListener('click', () => {
  game?.resume();
  if (mouseCaptureEnabled) (game as SettingsEngine | undefined)?.requestMouseCapture?.();
});
for (const id of ['abort', 'return']) el(id).addEventListener('click', () => game?.returnToMenu());
el('pause-button').addEventListener('click', () => game?.pause());
el('ship-list').addEventListener('click', event => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-ship]'); if (button) { selected = button.dataset.ship as ShipClass; shipDetails(); game?.previewShip(selected); text('selection-feedback', `${SHIPS[selected].name} selected — ready to launch`); } });
el('audio').addEventListener('click', () => { muted = !muted; game?.setMuted(muted); el('audio').innerHTML = `SOUND <span>${muted ? 'OFF' : 'ON'}</span>`; el('audio').setAttribute('aria-label', muted ? 'Enable audio' : 'Mute audio'); });
el('bounds').addEventListener('click', () => {
  collisionBoundsVisible = !collisionBoundsVisible;
  (game as SpaceGame & { setCollisionBoundsVisible?: (visible: boolean) => void })?.setCollisionBoundsVisible?.(collisionBoundsVisible);
  el('bounds').innerHTML = `BOUNDS <span>${collisionBoundsVisible ? 'ON' : 'OFF'}</span>`;
  el('bounds').setAttribute('aria-pressed', String(collisionBoundsVisible));
  el('bounds').setAttribute('aria-label', collisionBoundsVisible ? 'Hide collision bounds' : 'Show collision bounds');
});
el('quality').addEventListener('click', () => { highQuality = !highQuality; game?.setQuality(highQuality); el('quality').innerHTML = `FX <span>${highQuality ? 'HIGH' : 'LOW'}</span>`; el('quality').setAttribute('aria-label', highQuality ? 'Switch to performance graphics' : 'Switch to high graphics'); });
el('settings-open').addEventListener('click', () => {
  if (latest?.mode === 'playing') game?.pause();
  (el('settings') as HTMLDialogElement).showModal();
});
el('mouse-sensitivity').addEventListener('input', () => {
  mouseSensitivity = Number((el('mouse-sensitivity') as HTMLInputElement).value);
  text('sensitivity-value', `${mouseSensitivity.toFixed(2)}×`);
  game?.setMouseSensitivity(mouseSensitivity);
});
el('difficulty').addEventListener('change', () => { difficulty = (el('difficulty') as HTMLSelectElement).value as typeof difficulty; applySettings(); });
for (const [id, setter] of [['collisions-setting', (value: boolean) => { collisionsEnabled = value; }], ['damage-setting', (value: boolean) => { damageEnabled = value; }], ['capture-setting', (value: boolean) => { mouseCaptureEnabled = value; }]] as const) {
  el(id).addEventListener('change', () => { setter((el(id) as HTMLInputElement).checked); applySettings(); });
}
function zoomRadar(factor: number) {
  radarRange = Math.max(250, Math.min(8000, radarRange * factor));
  text('radar-scale', formatSpaceDistance(radarRange));
  (el('radar-in') as HTMLButtonElement).disabled = radarRange === 250;
  (el('radar-out') as HTMLButtonElement).disabled = radarRange === 8000;
  drawRadar();
}
el('radar-in').addEventListener('click', () => zoomRadar(.5));
el('radar-out').addEventListener('click', () => zoomRadar(2));
el('controls-open').addEventListener('click', () => (el('manual') as HTMLDialogElement).showModal());
document.querySelector('.brand')!.addEventListener('click', event => { event.preventDefault(); if (latest?.mode === 'playing') game?.pause(); });
window.addEventListener('keydown', event => {
  if ((el('manual') as HTMLDialogElement).open || (el('settings') as HTMLDialogElement).open) return;
  if (event.repeat) return;
  if ((event.target as HTMLElement).matches('input, select, textarea, [contenteditable="true"]')) return;
  if (event.code === 'KeyM' && (latest?.mode === 'playing' || latest?.mode === 'paused' || latest?.mode === 'menu')) {
    event.preventDefault();
    mouseCaptureEnabled = !mouseCaptureEnabled;
    (el('capture-setting') as HTMLInputElement).checked = mouseCaptureEnabled;
    game?.setMouseCaptureEnabled(mouseCaptureEnabled);
    return;
  }
  if (event.code === 'Enter' && (!latest || latest.mode === 'menu') && ((event.target as HTMLElement).matches('body, [data-ship], #launch'))) { event.preventDefault(); launch(); }
  if (event.code === 'Escape' || event.code === 'KeyP') {
    if (latest?.mode === 'playing') { event.preventDefault(); game?.pause(); }
    else if (latest?.mode === 'paused') { event.preventDefault(); game?.resume(); }
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && latest?.mode === 'playing') game?.pause(); });
window.addEventListener('pagehide', event => { if (!event.persisted) game?.dispose(); else game?.pause(); });
if (import.meta.hot) import.meta.hot.dispose(() => game?.dispose());
