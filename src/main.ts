import '@fontsource/chakra-petch/400.css';
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import './style.css';
import { SpaceGame, type GameSnapshot } from './game';
import { SHIPS, PICKUP_LABELS, PICKUP_TYPES, isCombatPickup, isUpgradePickup, pickupCssColor, type PickupType, type ShipClass } from './rules';
import { relativeRadarPosition, projectRadarContact, radarRingDistance } from './radar';
import { formatSpaceDistance } from './units';
import { formatDuration, getMissionRank } from './summary';
import { loadRecords, saveRecords, updateRecords, type RecordUpdate } from './records';
import { UPGRADE_MAX_LEVEL, getUpgradedShipStats, type UpgradeLevels } from './upgrades';
import { CHAPTERS, FINAL_CHAPTER_NUMBER, completeChapter, getChapterByNumber, getChapterRank, isChapterUnlocked, loadProgress, saveProgress, type CampaignProgress, type ChapterDef, type ObjectiveKind } from './campaign';
import { renderShipThumbnails } from './thumbnails';

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
const safeStorage = (() => { try { return window.localStorage; } catch { return null; } })();
let campaign: CampaignProgress = loadProgress(safeStorage);
let menuMode: 'campaign' | 'arcade' = (() => { try { return localStorage.getItem('void-squadron-mode') === 'arcade' ? 'arcade' : 'campaign'; } catch { return 'campaign'; } })();
let selectedChapter = Math.min(FINAL_CHAPTER_NUMBER, Object.keys(campaign.completed).length ? campaign.unlocked : 1);
let activeChapter: ChapterDef | undefined;
let lastChapterResult: ReturnType<typeof completeChapter> | undefined;
let records = loadRecords();
let lastRecordUpdate: RecordUpdate | undefined;
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
let mouseSensitivity = 5;
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
  <header class="topbar">
    <a class="brand" href="#" aria-label="Void Squadron home">${emblem}<span class="brand-word"><b>VOID</b><i>SQUADRON</i></span></a>
    <div class="topbar-status" aria-label="Station status"><span class="chip live"><span class="status-dot"></span>OUTER FRONTIER<em>SECTOR 07</em></span><span class="chip" id="chip-campaign">CAMPAIGN<em>0 / ${FINAL_CHAPTER_NUMBER}</em></span><span class="chip hide-sm">DOCK 04<em>CLAMPS ARMED</em></span></div>
    <div class="topbar-controls"><button id="audio" class="icon-button" aria-label="Mute audio" title="Toggle audio">SOUND <span>ON</span></button><button id="quality" class="icon-button" aria-label="Switch to performance graphics" title="Toggle graphics quality">FX <span>HIGH</span></button><button id="settings-open" class="icon-button" aria-label="Open game settings">SETTINGS</button><button id="bounds" class="icon-button" aria-label="Show collision bounds" aria-pressed="false" title="Toggle collision sphere visualization">BOUNDS <span>OFF</span></button><button id="pause-button" class="icon-button hidden" aria-label="Pause game">II</button></div>
  </header>
  <section id="menu" class="menu-screen">
    <div class="menu-main">
      <div class="mission-copy">
        <div class="mode-tabs" role="tablist" aria-label="Game mode"><button id="tab-campaign" class="mode-tab" role="tab" data-mode="campaign"><span>01</span>CAMPAIGN<small>7 CHAPTERS</small></button><button id="tab-arcade" class="mode-tab" role="tab" data-mode="arcade"><span>02</span>ARCADE<small>SHATTERED ORBIT</small></button></div>
        <div id="panel-campaign" class="panel glass" role="tabpanel" aria-labelledby="tab-campaign">
          <ol id="chapter-rail" class="chapter-rail" aria-label="Campaign chapters"></ol>
          <div id="chapter-detail" class="chapter-detail" aria-live="polite"></div>
          <div class="launch-row">
            <button id="launch-chapter" class="launch-button flex items-center justify-between"><span id="launch-chapter-label">LAUNCH CHAPTER</span>${arrow}</button>
            <div class="launch-hint"><kbd>ENTER</kbd> DEPLOY <span>•</span> <kbd>1</kbd>–<kbd>6</kbd> CRAFT <span>•</span> <kbd>[</kbd><kbd>]</kbd> CHAPTER</div>
          </div>
        </div>
        <div id="panel-arcade" class="panel arcade-panel">
          <div class="eyebrow flex items-center gap-3"><span class="tiny-line"></span> A SPACE COMBAT EXPERIENCE <span class="eyebrow-extra"><span class="separator">/</span> OPERATION SHATTERED ORBIT</span></div>
          <h1><span>THE VOID</span><span>IS <em>CALLING.</em></span></h1>
          <p class="intro">One pilot. An impossible frontier. Take flight, break the blockade, make it back.</p>
          <div class="mission-meta">
            <div><span class="meta-label">OBJECTIVE</span><strong>FIVE WAVES · DESTROY THE LEVIATHAN</strong></div>
            <div><span class="meta-label">THREAT LEVEL</span><strong class="amber">EXTREME <span class="threat-bars">▰▰▰▰▱</span></strong></div>
          </div>
          <div class="launch-row">
            <button id="launch" class="launch-button flex items-center justify-between"><span>LAUNCH MISSION</span>${arrow}</button>
            <div class="launch-hint"><kbd>ENTER</kbd> DEPLOY <span>•</span> <kbd>1</kbd>–<kbd>6</kbd> OR <kbd>←</kbd><kbd>→</kbd> PICK CRAFT</div>
          </div>
        </div>
      </div>
      <aside class="menu-side">
        <div class="scene-tag"><span class="bracket">┌</span><div><span class="meta-label">DOCKED AT</span><strong>HELIOS RING STATION</strong><small>FORWARD BASE · 07.24.89 N / 119.06.42 E</small></div></div>
        <section class="dossier glass" aria-label="Selected spacecraft" aria-live="polite">
          <div class="dossier-head"><span class="eyebrow">SELECTED CRAFT</span><span id="dossier-record" class="dossier-record"></span></div>
          <h2 id="ship-title"></h2>
          <div id="ship-role" class="dossier-role"></div>
          <p id="ship-description"></p>
          <dl id="stat-bars" class="stat-bars"></dl>
          <div id="dossier-upgrades" class="dossier-upgrades"></div>
        </section>
      </aside>
    </div>
    <div class="hangar">
      <div class="hangar-top flex items-center justify-between"><div class="flex items-center gap-3"><span class="section-index">HANGAR /</span><h2>SELECT YOUR SPACECRAFT</h2></div><span class="hangar-note hidden md:block">SIX CLASSES · LIVE 3D RENDER</span></div>
      <div id="ship-list" class="ship-list" role="group" aria-label="Select spacecraft">${(Object.keys(SHIPS) as ShipClass[]).map((key, i) => `<button class="ship-card ${key === selected ? 'selected' : ''}" data-ship="${key}" aria-pressed="${key === selected}" aria-keyshortcuts="${i + 1}"><span class="ship-art" data-art="${key}">${shipIcon(key)}</span><span class="ship-number">0${i + 1}</span><span class="ship-class">${key.toUpperCase()}</span><span class="ship-name">${SHIPS[key].name}</span><span class="ship-best" data-best="${key}"></span></button>`).join('')}</div>
    </div>
    <footer class="menu-footer flex items-center justify-between"><span>ORIGINAL UNIVERSE <span class="separator">/</span> REAL-TIME 3D</span><button id="controls-open" class="text-button">FLIGHT MANUAL ↗</button><span>PERSONAL BEST <b id="best">${best.toLocaleString()}</b></span></footer>
  </section>
  <section id="hud" class="hidden" aria-label="Combat status">
    <div class="hud-mission"><span class="eyebrow">OPERATION SHATTERED ORBIT</span><h2>BREAK THE BLOCKADE</h2><div class="flex gap-5"><span>WAVE <b id="wave">01</b> / 05</span><span>HOSTILES <b id="enemies">0</b></span></div></div>
    <aside id="objective-card" class="objective-card hidden" aria-label="Mission objective"><div class="ob-head"><span id="ob-chapter" class="eyebrow"></span><span id="ob-stage"></span></div><strong id="ob-line"></strong><p id="ob-hint"></p><div class="ob-progress"><i id="ob-progress"></i></div><div id="ob-det-row" class="ob-row hidden"><span>DETECTION</span><div class="meter"><i id="ob-det"></i></div><b id="ob-det-val"></b></div><div id="ob-asset-row" class="ob-row hidden"><span id="ob-asset-label">ASSET HULL</span><div class="meter"><i id="ob-asset"></i></div><b id="ob-asset-val"></b></div><div id="ob-time-row" class="ob-row hidden"><span>TIME LEFT</span><div class="ob-time" id="ob-time"></div></div></aside>
    <div class="hud-score"><span class="meta-label">COMBAT SCORE</span><strong id="score">000000</strong><span id="combo" class="amber"></span></div>
    <div class="reticle" aria-hidden="true"><span></span><i></i></div>
    <aside class="upgrade-panel" aria-label="Permanent spacecraft upgrades"><div class="upgrade-title">PERMANENT UPGRADES <span>THIS SHIP</span></div><div class="upgrade-row"><span>HULL</span><div class="upgrade-track"><i id="upgrade-hull-bar"></i></div><b id="upgrade-hull-level">0 / 10</b></div><div class="upgrade-row"><span>DEFENSE</span><div class="upgrade-track"><i id="upgrade-defense-bar"></i></div><b id="upgrade-defense-level">0 / 10</b></div><div class="upgrade-row"><span>ATTACK</span><div class="upgrade-track"><i id="upgrade-attack-bar"></i></div><b id="upgrade-attack-level">0 / 10</b></div><div class="upgrade-effects" id="upgrade-effects"></div></aside>
    <div id="boss-banner" class="boss-banner hidden" role="alert" aria-live="assertive"><span id="boss-banner-kicker"></span><strong id="boss-banner-title"></strong><small id="boss-banner-copy"></small></div>
    <aside id="boss-card" class="boss-card hidden" aria-label="Capital ship status"><div class="boss-head"><span id="boss-name">THE LEVIATHAN</span><em id="boss-phase" class="boss-phase">SHIELDED</em><b id="boss-pct">100%</b></div><div class="boss-bar shield"><i id="boss-shield-bar"></i></div><div class="boss-bar hull"><i id="boss-hull-bar"></i></div><div class="boss-chips" id="boss-chips"></div></aside>
    <div id="target-layer" class="target-layer" aria-hidden="true">
      <div id="target-box" class="target-box hidden"><i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i><div class="tb-label"><b id="tb-name"></b><span id="tb-dist"></span><em id="tb-detail"></em><div class="tb-bars"><i id="tb-shield"></i><i id="tb-hull"></i></div></div></div>
      <div id="target-lead" class="target-lead hidden"></div>
      <div id="target-arrow" class="target-arrow hidden"><svg viewBox="0 0 40 40"><path d="M35 20L9 7L16 20L9 33Z" fill="currentColor"/></svg><div class="ta-label"><b id="ta-name"></b><span id="ta-dist"></span><em id="ta-turn"></em></div></div>
    </div>
    <div class="assist-bar">
      <div id="capture-indicator" class="capture-indicator">M · MOUSE FREE</div>
      <button id="assist-target" class="assist-btn" tabindex="-1" aria-label="Target nearest enemy (T)"><kbd>T</kbd><span>TARGET</span><small id="assist-target-info"></small></button>
      <button id="assist-auto" class="assist-btn" tabindex="-1" aria-label="Toggle autopilot (P)"><kbd>P</kbd><span>AUTOPILOT</span><small id="assist-auto-info"></small></button>
      <button id="assist-combat" class="assist-btn" tabindex="-1" aria-label="Toggle autocombat (C)"><kbd>C</kbd><span>AUTOCOMBAT</span><small id="assist-combat-info"></small></button>
    </div>
    <div id="message" class="combat-message" role="status" aria-live="polite"></div>
    <div class="hud-bottom"><div class="systems"><span class="eyebrow" id="pilot-ship"></span><div class="system-row"><span>SHIELD</span><div class="meter"><i id="shield-bar"></i></div><b id="shield-value">100</b></div><div class="system-row hull"><span>HULL</span><div class="meter"><i id="hull-bar"></i></div><b id="hull-value">100</b></div><div class="ordnance" id="ordnance"><div class="orow torp" id="orow-torp"><span>TORPEDOES</span><div class="torp-pips" id="torp-pips"></div><kbd>X</kbd></div><div class="orow oc hidden" id="orow-oc"><span>OVERCHARGE</span><div class="meter"><i id="oc-bar"></i></div><b id="oc-time"></b></div><div class="orow ae hidden" id="orow-ae"><span>AEGIS</span><div class="meter"><i id="ae-bar"></i></div><b id="ae-val"></b></div></div></div><div class="flight-hints hidden md:flex"><span>MOUSE / <kbd>W A S D</kbd> · YAW / PITCH</span><span>WHEEL / <kbd>Q E</kbd> · ROLL</span><span><kbd>SPACE</kbd> / CLICK · FIRE</span><span><kbd>X</kbd> / R-CLICK · TORPEDO</span><span><kbd>SHIFT</kbd> · BOOST</span><span><kbd>Z</kbd> · BRAKE / CREEP</span><span><kbd>ESC</kbd> · PAUSE</span></div><div class="boost-system"><span class="meta-label">ENGINE OUTPUT</span><strong><span id="speed">0</span><small> KM/S</small></strong><div class="meter boost"><i id="energy-bar"></i></div></div></div>
    <aside class="radar-panel" aria-label="Tactical radar"><div class="radar-heading"><span>TACTICAL SCANNER</span><b id="radar-scale">1,000 KM</b></div><canvas id="radar" width="360" height="360" aria-label="Ship-relative contact map"></canvas><div class="radar-zoom"><button id="radar-in" aria-label="Zoom radar in">+</button><span id="radar-range" role="status">SCANNING CONTACTS</span><button id="radar-out" aria-label="Zoom radar out">−</button></div><div id="radar-supply" class="radar-supply" role="status"></div><div class="radar-legend"><span class="hostile">◆ HOSTILE</span><span class="neutral">◇ BONUS</span><span class="boss">■ CAPITAL</span><span class="tgt">◎ TARGET</span><span class="obj">⌖ OBJECTIVE</span></div><div class="radar-legend supplies">${PICKUP_TYPES.filter(t => !isUpgradePickup(t) && !isCombatPickup(t)).map(t => `<span style="color:${pickupCssColor(t)}">+ ${t.toUpperCase()}</span>`).join('')}<span class="upg">${PICKUP_TYPES.filter(isUpgradePickup).map(t => `<i style="color:${pickupCssColor(t)}" title="${PICKUP_LABELS[t]}">◈</i>`).join('')} UPGRADES</span></div><div class="radar-legend supplies combat">${PICKUP_TYPES.filter(isCombatPickup).map(t => `<span style="color:${pickupCssColor(t)}" title="${PICKUP_LABELS[t]}">⬢ ${t === 'torpedo' ? 'TORPEDO' : t.toUpperCase()}</span>`).join('')}</div><div class="radar-caption">TOP: AHEAD · BOTTOM: BEHIND · CLICK A CONTACT TO TARGET · RINGS SHOW KM</div></aside>
    <div id="recovery-status" class="recovery-status" role="status" aria-live="polite"></div>
    <div id="damage-flash" aria-hidden="true"></div>
  </section>
  <section id="pause" class="overlay hidden" aria-labelledby="pause-title"><div class="modal"><span class="eyebrow">FLIGHT SYSTEMS ON STANDBY</span><h2 id="pause-title">HOLDING<br><span>POSITION.</span></h2><p>Take a breath, pilot. The frontier can wait.</p><button id="resume" class="launch-button flex items-center justify-between">RESUME FLIGHT ${arrow}</button><button id="abort" class="secondary-button">RETURN TO HANGAR</button></div></section>
  <section id="results" class="overlay hidden" aria-labelledby="result-title"><div class="modal"><span id="result-eyebrow" class="eyebrow"></span><h2 id="result-title"></h2><p id="result-copy"></p><div id="result-breakdown" class="result-breakdown" aria-label="Mission breakdown"></div><div id="result-records" class="result-records" role="status"></div><div class="result-stats flex justify-between"><div><span class="meta-label">FINAL SCORE</span><strong id="final-score"></strong></div><div><span class="meta-label">CONFIRMED KILLS</span><strong id="final-kills"></strong></div></div><button id="next-chapter" class="launch-button hidden flex items-center justify-between"><span id="next-chapter-label">NEXT CHAPTER</span>${arrow}</button><button id="retry" class="launch-button flex items-center justify-between"><span id="retry-label">DEPLOY AGAIN</span>${arrow}</button><button id="return" class="secondary-button">RETURN TO HANGAR</button></div></section>
  <dialog id="settings"><form method="dialog"><button class="dialog-close" aria-label="Close game settings">×</button><span class="eyebrow">FLIGHT CONFIGURATION</span><h2>GAME SETTINGS</h2><label class="setting-row" for="difficulty"><span>DIFFICULTY<small>Enemy aggression and recovery generosity</small></span><select id="difficulty"><option value="relaxed">Relaxed</option><option value="standard" selected>Standard</option><option value="veteran">Veteran</option></select></label><label class="setting-row" for="collisions-setting"><span>PHYSICAL COLLISIONS<small>Spacecraft, asteroids, planets and carriers</small></span><input id="collisions-setting" type="checkbox" checked></label><label class="setting-row" for="damage-setting"><span>PLAYER DAMAGE<small>Off: your hull and shields ignore incoming damage</small></span><input id="damage-setting" type="checkbox" checked></label><label class="setting-row" for="capture-setting"><span>CAPTURE MOUSE<small>Lock and hide cursor during flight; Escape releases it</small></span><input id="capture-setting" type="checkbox"></label><label class="setting-row sensitivity-row" for="mouse-sensitivity"><span>MOUSE SENSITIVITY<small>Scales both capture mode and free-cursor steering · M toggles capture</small></span><div class="sensitivity-control"><output id="sensitivity-value" for="mouse-sensitivity">5.0×</output><input id="mouse-sensitivity" type="range" min="0.5" max="10" step="0.5" value="5" aria-label="Mouse sensitivity"></div></label><label class="setting-row" for="star-density"><span>STARFIELD DENSITY<small>Distant stars and the streaking motion stars</small></span><div class="range-control"><output id="star-density-value" for="star-density">100%</output><input id="star-density" type="range" min="0" max="200" step="25" value="100" aria-label="Starfield density"></div></label><label class="setting-row" for="panel-translucency"><span>PANEL TRANSLUCENCY<small>How see-through every panel, card and dialog is</small></span><div class="range-control"><output id="panel-translucency-value" for="panel-translucency">40%</output><input id="panel-translucency" type="range" min="0" max="80" step="5" value="40" aria-label="Panel translucency"></div></label><label class="setting-row" for="panel-rounding"><span>PANEL ROUNDING<small>0 keeps the original sharp, chamfered look</small></span><div class="range-control"><output id="panel-rounding-value" for="panel-rounding">0 px</output><input id="panel-rounding" type="range" min="0" max="24" step="2" value="0" aria-label="Panel rounding"></div></label><p class="small-copy">Collisions and player damage are independent. Disabling damage keeps your weapons and power-up collection active. Mouse capture begins on Launch or Resume, with browser permission.</p><button class="secondary-button">APPLY & CLOSE</button></form></dialog>
  <dialog id="manual"><form method="dialog"><button class="dialog-close" aria-label="Close flight manual">×</button><span class="eyebrow">PILOT BRIEFING / 07</span><h2>FLIGHT MANUAL</h2><p><b>CAMPAIGN</b> — seven chapters with different objectives: eliminate, scan, infiltrate, retrieve, defend, navigate and hunt, ending with the Leviathan. Clear a chapter to unlock the next, earn a permanent upgrade on your first clear and chase S-ranks by beating par time with little damage. Use <kbd>[</kbd> / <kbd>]</kbd> on the start screen to browse chapters. <b>ARCADE</b> — Operation Shattered Orbit: clear combat hostiles across five waves. Fighters make attack passes, interceptors chase aggressively, and heavier warships turn slowly. Shuttles and freighters flee without firing: optional bonus targets, not mission blockers. Fly away to break pursuit and recover using shield, energy, and hull-repair supplies.</p><dl><dt>MOUSE / WASD / ARROWS</dt><dd>Yaw and pitch your ship. Point your nose where you want to fly; thrust carries you forward in that direction.</dd><dt>SCROLL WHEEL / Q / E</dt><dd>Roll around your ship’s forward axis. Your chase camera banks with you.</dd><dt>M / MOUSE CAPTURE</dt><dd>Toggle cursor capture. Adjust capture sensitivity from 0.5× to 10× in Settings. Escape releases capture and pauses.</dd><dt>CLICK / SPACE</dt><dd>Hold to fire your primary cannons.</dd><dt>SHIFT</dt><dd>Boost. Energy replenishes when released.</dd><dt>Z · BRAKE</dt><dd>Hold to throttle down to a quarter speed. Needed for slow scans and for creeping through listening-post sensor nets without raising an alarm.</dd><dt>X / RIGHT-CLICK · PROTON TORPEDO</dt><dd>Fires a homing torpedo at your lock (or whatever is near your nose). Heavy splash damage, ×1.6 against Leviathan systems. Fighters carry 4, bombers 8, destroyers 6; interceptors, shuttles and freighters carry none.</dd><dt>ESC</dt><dd>Pause or resume your mission.</dd><dt>T / SHIFT+T</dt><dd>Lock a target: first press picks the hostile closest to your nose, further presses cycle outward. Shift+T clears it. You can also click a contact on the radar. A bracket marks the target on screen with a lead pip showing where to aim; when it is off-screen an edge arrow shows which way to turn.</dd><dt>P · AUTOPILOT</dt><dd>Flies toward your target (or the nearest hostile, capital ship or useful supply) without firing and steers around hazards. Any steering key, a big mouse movement in capture mode, or pressing P again takes control back.</dd><dt>C · AUTOCOMBAT</dt><dd>Full combat assist: hunts targets with lead aiming, fires when lined up, evades collisions, boosts to close distance, falls back to collect supplies when hurt, and attacks the Leviathan’s shield domes then bridge. It is an assistant, not an ace: stay alert.</dd><dt>TACTICAL RADAR</dt><dd>Red diamonds: combat hostiles. Amber outlines: optional fleeing ships. Supplies are color-coded crosses: yellow energy, blue shield, green hull repair; larger ringed diamonds are permanent upgrades (orange hull, violet defense, pink attack); hexagons are combat boosts (red torpedoes, magenta overcharge, white aegis overshield). In campaign chapters a glowing cyan ⌖ marker is your current objective and dashed red rings are sensor pylons; the targeting arrow guides you there when nothing is locked. A dashed white ring marks your locked target, and you can click any hostile on the radar to lock it. Use + / − to zoom from 250 to 8,000 km. Top is ahead; bottom is behind. ▲ / ▼ indicate relative altitude. Distant contacts stay on the radar edge.</dd><dt>WAVE 5 · THE LEVIATHAN</dt><dd>A capital carrier must be destroyed to win. Shoot the two shield domes first, then the command bridge; the flight deck silences the ventral turrets. Main-hull hits are weak. Keep weaving: its turrets lead your motion, so flying in a straight line is dangerous. Radar marks it in pink.</dd><dt>BOUNDS</dt><dd>Optional collision-sphere visualization. Off by default; impact flashes appear on spacecraft surfaces.</dd></dl><div class="manual-warning"><strong>WATCH YOUR VECTOR.</strong><p>Asteroid impacts scale with relative speed, mass, and armor. Shields absorb damage first. Shields regenerate after a quiet interval — hull damage is permanent.</p></div><p class="small-copy">On touchscreens, drag on the space view to steer and fire. Desktop keyboard and mouse recommended.</p><button class="secondary-button">UNDERSTOOD</button></form></dialog>
`;
const el = (id: string) => document.getElementById(id)!;
const text = (id: string, value: string | number) => { const target = el(id); const next = String(value); if (target.textContent !== next) target.textContent = next; };
const show = (id: string, visible: boolean) => el(id).classList.toggle('hidden', !visible);
function renderBests() {
  for (const key of Object.keys(SHIPS) as ShipClass[]) {
    const record = records[key];
    const target = document.querySelector<HTMLElement>(`[data-best="${key}"]`);
    if (!target) continue;
    target.dataset.rank = record.bestRank ?? '';
    target.innerHTML = record.bestRank
      ? `<b>${record.bestRank}</b><span>${record.fastestBossSec !== null ? formatDuration(record.fastestBossSec) : '--:--'}</span>`
      : '<em>UNRANKED</em>';
    target.title = record.bestRank
      ? `Best rank ${record.bestRank}${record.fastestBossSec !== null ? ` · fastest Leviathan kill ${formatDuration(record.fastestBossSec)}` : ''} · ${record.wins} win${record.wins === 1 ? '' : 's'} · best score ${record.bestScore.toLocaleString()}`
      : record.bestScore > 0 ? `No victories yet · best score ${record.bestScore.toLocaleString()}` : 'No missions recorded yet';
  }
}
const STAT_MAX = (() => {
  const ships = Object.values(SHIPS);
  const dps = (s: (typeof ships)[number]) => s.damage / s.fireInterval;
  return { hull: Math.max(...ships.map(s => s.hull)), shield: Math.max(...ships.map(s => s.shield)), speed: Math.max(...ships.map(s => s.speed)), armor: Math.max(...ships.map(s => s.armor)), firepower: Math.max(...ships.map(dps)) };
})();
function statRow(label: string, base: number, value: number, max: number, unit = '') {
  const basePct = Math.min(100, base / max * 100 * 0.8), bonusPct = Math.min(100 - basePct, Math.max(0, (value - base) / max * 100 * 0.8));
  return `<div><dt>${label}</dt><dd><span class="bar"><i class="base" style="width:${basePct.toFixed(1)}%"></i><i class="bonus" style="width:${bonusPct.toFixed(1)}%"></i></span><b>${Math.round(value * 10) / 10}${unit}</b></dd></div>`;
}
function shipDetails() {
  const levels = game?.getShipUpgradeLevels(selected) ?? { hull: 0, defense: 0, attack: 0 };
  const base = SHIPS[selected];
  const ship = getUpgradedShipStats(base, levels);
  const dps = (s: typeof base) => s.damage / s.fireInterval;
  text('ship-title', ship.name.toUpperCase()); text('ship-role', ship.role.toUpperCase());
  text('ship-description', ship.description);
  el('stat-bars').innerHTML = [
    statRow('HULL', base.hull, ship.hull, STAT_MAX.hull),
    statRow('SHIELD', base.shield, ship.shield, STAT_MAX.shield),
    statRow('SPEED', base.speed, ship.speed, STAT_MAX.speed, ' km/s'),
    statRow('ARMOR', base.armor * 100, ship.armor * 100, STAT_MAX.armor * 100, '%'),
    statRow('FIREPOWER', dps(base), dps(ship), STAT_MAX.firepower, ' dps'),
  ].join('');
  const pips = (n: number) => `<span class="pips">${Array.from({ length: UPGRADE_MAX_LEVEL }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
  el('dossier-upgrades').innerHTML = (['hull', 'defense', 'attack'] as const).map(k => `<div><span>${k === 'defense' ? 'DEF' : k.toUpperCase()}</span>${pips(levels[k])}<b>${levels[k]}/${UPGRADE_MAX_LEVEL}</b></div>`).join('');
  const record = records[selected];
  text('dossier-record', record.bestRank ? `BEST ${record.bestRank}${record.fastestBossSec !== null ? ` · ${formatDuration(record.fastestBossSec)}` : ''} · ${record.wins} WIN${record.wins === 1 ? '' : 'S'}` : 'UNRANKED');
  document.querySelectorAll<HTMLButtonElement>('[data-ship]').forEach(button => {
    const active = button.dataset.ship === selected;
    button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active));
  });
}
function selectShip(next: ShipClass) {
  if (next === selected) return;
  selected = next; shipDetails(); game?.previewShip(selected);
}
renderBests();
shipDetails();
type UiSettings = { starDensity: number; translucency: number; rounding: number };
const UI_KEY = 'void-squadron.ui.v1';
const uiSettings: UiSettings = (() => {
  const fallback: UiSettings = { starDensity: 100, translucency: 40, rounding: 0 };
  try {
    const parsed = JSON.parse(localStorage.getItem(UI_KEY) ?? 'null') as Partial<UiSettings> | null;
    const num = (value: unknown, min: number, max: number, def: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : def;
    return parsed ? { starDensity: num(parsed.starDensity, 0, 200, 100), translucency: num(parsed.translucency, 0, 80, 40), rounding: num(parsed.rounding, 0, 24, 0) } : fallback;
  } catch { return fallback; }
})();
function applyUiSettings(persist = false) {
  const root = document.documentElement.style;
  root.setProperty('--pa', (1 - uiSettings.translucency / 100).toFixed(2));
  root.setProperty('--r', `${uiSettings.rounding}px`);
  document.body.classList.toggle('rounded', uiSettings.rounding > 0);
  game?.setStarDensity(uiSettings.starDensity / 100);
  (el('star-density') as HTMLInputElement).value = String(uiSettings.starDensity); text('star-density-value', `${uiSettings.starDensity}%`);
  (el('panel-translucency') as HTMLInputElement).value = String(uiSettings.translucency); text('panel-translucency-value', `${uiSettings.translucency}%`);
  (el('panel-rounding') as HTMLInputElement).value = String(uiSettings.rounding); text('panel-rounding-value', `${uiSettings.rounding} px`);
  if (persist) try { localStorage.setItem(UI_KEY, JSON.stringify(uiSettings)); } catch { /* Preferences are optional. */ }
}
function applySettings() {
  const engine = game as SettingsEngine | undefined;
  engine?.setDifficulty?.(difficulty);
  engine?.setCollisionsEnabled?.(collisionsEnabled);
  engine?.setDamageEnabled?.(damageEnabled);
  game?.setMouseSensitivity(mouseSensitivity);
  engine?.setMouseCaptureEnabled?.(mouseCaptureEnabled);
}
const KIND_LABEL: Record<ObjectiveKind, string> = { eliminate: 'ELIMINATE', scan: 'SCAN', retrieve: 'RETRIEVE', defend: 'DEFEND', navigate: 'NAVIGATE', hunt: 'HUNT', stealth: 'INFILTRATE', boss: 'DESTROY' };
const UPGRADE_LABEL = { hull: 'HULL', defense: 'DEFENSE', attack: 'ATTACK' } as const;
const threatBars = (level: number) => `${'▰'.repeat(level)}${'▱'.repeat(FINAL_CHAPTER_NUMBER - level)}`;
const rankHtml = (rank: string) => `<b class="rank-tag" data-rank="${rank}">${rank}</b>`;
function renderChapters() {
  const cleared = Object.keys(campaign.completed).length;
  el('chip-campaign').innerHTML = `CAMPAIGN<em>${cleared} / ${FINAL_CHAPTER_NUMBER}</em>`;
  el('chapter-rail').innerHTML = CHAPTERS.map(chapter => {
    const record = campaign.completed[chapter.id];
    const locked = !isChapterUnlocked(campaign, chapter.number);
    const state = locked ? 'locked' : record ? 'cleared' : 'open';
    return `<li><button class="chapter-node ${state} ${chapter.number === selectedChapter ? 'selected' : ''}" data-chapter="${chapter.number}" aria-pressed="${chapter.number === selectedChapter}" aria-label="Chapter ${chapter.number}: ${chapter.title}${locked ? ' (locked)' : ''}"><span class="cn-num">${String(chapter.number).padStart(2, '0')}</span><span class="cn-title">${chapter.title}</span><span class="cn-state">${locked ? '⌧ LOCKED' : record ? rankHtml(record.bestRank) : '◇ NEW'}</span></button></li>`;
  }).join('');
  const chapter = getChapterByNumber(selectedChapter)!;
  const record = campaign.completed[chapter.id];
  const locked = !isChapterUnlocked(campaign, chapter.number);
  const reward = chapter.reward.upgrade ? `+1 ${UPGRADE_LABEL[chapter.reward.upgrade]}` : '';
  const claimed = campaign.rewardsClaimed.includes(chapter.id);
  el('chapter-detail').innerHTML = `
    <div class="cd-head"><span class="eyebrow">CHAPTER ${String(chapter.number).padStart(2, '0')} / ${String(FINAL_CHAPTER_NUMBER).padStart(2, '0')} <span class="separator">/</span> ${chapter.codename.toUpperCase()}</span>${record ? `<span class="cd-best">BEST ${rankHtml(record.bestRank)} · ${formatDuration(record.bestTimeSec)}</span>` : ''}</div>
    <h2 class="cd-title">${chapter.title.toUpperCase()}</h2>
    <p class="cd-brief">${chapter.briefing.join(' ')}</p>
    <ul class="cd-stages">${chapter.stages.map((stage, index) => `<li><span>${KIND_LABEL[stage.kind]}</span><i class="cs-label">${stage.label}</i>${chapter.stages.length > 1 ? `<em>${index + 1}/${chapter.stages.length}</em>` : ''}</li>`).join('')}</ul>
    <div class="mission-meta"><div><span class="meta-label">THREAT</span><strong class="amber threat-line">${threatBars(chapter.difficulty)}</strong></div><div><span class="meta-label">PAR TIME</span><strong>${formatDuration(chapter.parTimeSec)}</strong></div><div><span class="meta-label">REWARD</span><strong class="reward ${claimed ? 'claimed' : ''}">${chapter.reward.label}${reward ? ` · ${reward}` : ''}${claimed ? ' ✓' : ''}</strong></div></div>`;
  const button = el('launch-chapter') as HTMLButtonElement;
  button.disabled = locked || !game;
  text('launch-chapter-label', locked ? `CLEAR CHAPTER ${chapter.number - 1} TO UNLOCK` : record ? `REPLAY CHAPTER ${chapter.number}` : `LAUNCH CHAPTER ${chapter.number}`);
}
function selectChapter(number: number) {
  selectedChapter = Math.max(1, Math.min(FINAL_CHAPTER_NUMBER, number));
  renderChapters();
}
function setMenuMode(mode: 'campaign' | 'arcade') {
  menuMode = mode;
  try { localStorage.setItem('void-squadron-mode', mode); } catch { /* Preferences are optional. */ }
  el('panel-campaign').classList.toggle('hidden', mode !== 'campaign');
  el('panel-arcade').classList.toggle('hidden', mode !== 'arcade');
  document.querySelectorAll<HTMLButtonElement>('.mode-tab').forEach(tab => { const active = tab.dataset.mode === mode; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); });
}
function applyThumbnails() {
  const thumbs = renderShipThumbnails();
  for (const [ship, url] of Object.entries(thumbs)) {
    const art = document.querySelector<HTMLElement>(`[data-art="${ship}"]`);
    if (art && url) { art.innerHTML = `<img src="${url}" alt="" draggable="false">`; art.classList.add('rendered'); }
  }
}
function launch(chapter?: ChapterDef) {
  (el('manual') as HTMLDialogElement).close();
  (el('settings') as HTMLDialogElement).close();
  applySettings();
  activeChapter = chapter;
  lastChapterResult = undefined;
  game?.start(selected, chapter);
}
const launchMenuSelection = () => launch(menuMode === 'campaign' ? getChapterByNumber(selectedChapter) : undefined);
type RadarContact = { position: { x: number; y: number; z: number }; kind: 'hostile' | 'neutral' | 'pickup' | 'boss' | 'system'; pickup?: PickupType; enemyId?: number };
const RADAR_CURVE = 0.62;
let radarHits: { x: number; y: number; kind: 'enemy' | 'boss'; id: number }[] = [];
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
  ctx.font = '15px monospace'; ctx.fillStyle = '#83e5e777'; ctx.textAlign = 'left';
  for (const scale of [0.33, 0.66]) ctx.fillText(String(Math.round(radarRingDistance(scale, radarRange, RADAR_CURVE) / 10) * 10), center + 4, center - radius * scale - 3);
  ctx.fillStyle = '#83e5e7'; ctx.beginPath(); ctx.moveTo(center, center - 9); ctx.lineTo(center + 5, center + 6); ctx.lineTo(center - 5, center + 6); ctx.closePath(); ctx.fill();
  let nearest = Infinity, nearestSupply = Infinity;
  let nearestSupplyType: PickupType | undefined;
  radarHits = [];
  const contacts: RadarContact[] = telemetry.enemies.map(enemy => ({ position: enemy.position, enemyId: enemy.id, kind: enemy.ship === 'shuttle' || enemy.ship === 'freighter' ? 'neutral' : 'hostile' }));
  const bossTelemetry = telemetry.boss && !telemetry.boss.defeated ? telemetry.boss : null;
  if (bossTelemetry) {
    contacts.push({ position: bossTelemetry.position, kind: 'boss' });
    bossTelemetry.subsystems.filter(sub => !sub.destroyed).forEach(sub => contacts.push({ position: sub.position, kind: 'system' }));
  }
  telemetry.pickups?.forEach(pickup => contacts.push({ position: pickup.position, kind: 'pickup', pickup: pickup.type }));
  const target = telemetry.target;
  for (const contact of contacts) {
    const local = relativeRadarPosition(contact.position, telemetry.player.position, telemetry.player.orientation);
    const projected = projectRadarContact(local, radarRange, RADAR_CURVE);
    if (contact.kind === 'hostile' || contact.kind === 'boss') nearest = Math.min(nearest, projected.distance);
    const x = center + projected.x * radius, y = center + projected.y * radius;
    ctx.globalAlpha = projected.edge ? .7 : 1;
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    if (contact.kind === 'pickup' && contact.pickup) {
      const color = pickupCssColor(contact.pickup);
      const upgrade = isUpgradePickup(contact.pickup), combat = isCombatPickup(contact.pickup);
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260 + x * 0.13);
      ctx.strokeStyle = ctx.fillStyle = color;
      // Canvas is shown at roughly half size, so markers are drawn about twice as large as they appear.
      ctx.globalAlpha = 0.25 + 0.4 * pulse; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 13 + 6 * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = projected.edge ? .85 : 1;
      ctx.shadowColor = color; ctx.shadowBlur = 14;
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      if (combat) {
        for (let index = 0; index < 6; index += 1) { const angle = Math.PI / 6 + index * Math.PI / 3; const px = x + Math.cos(angle) * 10, py = y + Math.sin(angle) * 10; if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
        ctx.closePath(); ctx.fill();
      } else if (upgrade) {
        ctx.moveTo(x, y - 12); ctx.lineTo(x + 12, y); ctx.lineTo(x, y + 12); ctx.lineTo(x - 12, y); ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.stroke();
      } else {
        ctx.lineWidth = 4.2; ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y); ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8); ctx.stroke();
      }
      ctx.shadowBlur = 0;
      const supplyDistance = projected.distance;
      if (supplyDistance < nearestSupply) { nearestSupply = supplyDistance; nearestSupplyType = contact.pickup; }
      continue;
    }
    ctx.strokeStyle = ctx.fillStyle = contact.kind === 'hostile' ? '#ff776c' : contact.kind === 'neutral' ? '#ffbf69' : '#ff4fa3';
    const isTarget = !!target && ((target.kind === 'boss' && contact.kind === 'boss') || (target.kind === 'enemy' && contact.enemyId === target.id));
    if (contact.kind === 'boss') { ctx.lineWidth = 2.5; ctx.strokeRect(x - 9, y - 9, 18, 18); ctx.fillRect(x - 4, y - 4, 8, 8); radarHits.push({ x, y, kind: 'boss', id: 0 }); }
    else if (contact.kind === 'system') { ctx.fillRect(x - 2, y - 2, 4, 4); }
    else {
      ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.closePath();
      if (contact.kind === 'hostile') ctx.fill(); else ctx.stroke();
      if (contact.enemyId !== undefined) radarHits.push({ x, y, kind: 'enemy', id: contact.enemyId });
      if (Math.abs(local.y) > 35) { ctx.font = '14px monospace'; ctx.fillText(local.y > 0 ? '▲' : '▼', x + 7, y + 4); }
    }
    if (isTarget) {
      ctx.globalAlpha = 1; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(x, y, contact.kind === 'boss' ? 17 : 11, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(center, center); ctx.lineTo(x, y); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  let objectiveDistance = Infinity;
  const objective = telemetry.objective;
  if (objective) {
    const palette: Record<string, string> = { beacon: '#62d9ff', sensor: '#ff6a6a', post: '#ffb866', artefact: '#ffd35a', gate: '#62f08a', extraction: '#62f08a' };
    const beat = 0.5 + 0.5 * Math.sin(performance.now() / 240);
    for (const point of objective.points) {
      if (point.done) continue;
      const projected = projectRadarContact(relativeRadarPosition(point, telemetry.player.position, telemetry.player.orientation), radarRange, RADAR_CURVE);
      const x = center + projected.x * radius, y = center + projected.y * radius;
      const color = palette[point.kind] ?? '#62d9ff';
      ctx.globalAlpha = projected.edge ? .7 : 1; ctx.strokeStyle = ctx.fillStyle = color; ctx.setLineDash([]);
      if (point.focus) {
        objectiveDistance = Math.min(objectiveDistance, projected.distance);
        ctx.shadowColor = color; ctx.shadowBlur = 14; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = (projected.edge ? .7 : 1) * (0.3 + 0.5 * beat); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 17 + 7 * beat, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = projected.edge ? .8 : 1;
        ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 6, y); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
      } else if (point.kind === 'sensor') {
        ctx.lineWidth = 2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      } else {
        ctx.globalAlpha *= 0.75; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke();
      }
    }
    if (objective.asset) {
      const projected = projectRadarContact(relativeRadarPosition(objective.asset, telemetry.player.position, telemetry.player.orientation), radarRange, RADAR_CURVE);
      const x = center + projected.x * radius, y = center + projected.y * radius;
      ctx.globalAlpha = 1; ctx.strokeStyle = ctx.fillStyle = '#62d9ff'; ctx.lineWidth = 2.5; ctx.shadowColor = '#62d9ff'; ctx.shadowBlur = 12;
      ctx.strokeRect(x - 8, y - 8, 16, 16); ctx.fillRect(x - 3, y - 3, 6, 6); ctx.shadowBlur = 0;
      objectiveDistance = Math.min(objectiveDistance, projected.distance);
    }
    ctx.globalAlpha = 1;
  }
  const hostileText = Number.isFinite(nearest) ? `HOSTILE ${formatSpaceDistance(nearest)}` : 'NO COMBAT CONTACTS';
  text('radar-range', Number.isFinite(objectiveDistance) ? `OBJECTIVE ${formatSpaceDistance(objectiveDistance)} · ${hostileText}` : Number.isFinite(nearest) ? `NEAREST ${hostileText}` : hostileText);
  const supplyEl = el('radar-supply');
  if (nearestSupplyType) { supplyEl.style.color = pickupCssColor(nearestSupplyType); text('radar-supply', `NEAREST ${PICKUP_LABELS[nearestSupplyType]} · ${formatSpaceDistance(nearestSupply)}`); }
  else { supplyEl.style.color = ''; text('radar-supply', 'NO SUPPLIES IN RANGE'); }
}
el('radar').addEventListener('click', event => {
  const canvas = el('radar') as HTMLCanvasElement;
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width * 360, y = (event.clientY - rect.top) / rect.height * 360;
  let best: (typeof radarHits)[number] | undefined, bestDistance = 26;
  for (const hit of radarHits) { const d = Math.hypot(hit.x - x, hit.y - y); if (d < bestDistance) { bestDistance = d; best = hit; } }
  if (best) game?.setTarget(best.kind, best.id);
});
function renderBreakdown(state: GameSnapshot, won: boolean) {
  const summary = state.summary;
  const target = el('result-breakdown');
  if (!summary) { target.innerHTML = ''; el('result-records').innerHTML = ''; return; }
  const rank = getMissionRank(summary, won);
  const bossValue = summary.bossTimeSec !== null ? formatDuration(summary.bossTimeSec) : summary.bossEngaged ? `${summary.bossHullPct ?? 100}% LEFT` : 'NOT ENGAGED';
  const rows: [string, string, string?][] = [
    ['FLIGHT TIME', formatDuration(summary.durationSec)],
    ['ACCURACY', `${Math.round(summary.accuracy * 100)}%`, `${summary.shotsHit} / ${summary.shotsFired} shots`],
    ['DAMAGE TAKEN', String(Math.round(summary.damageTaken)), 'shield + hull absorbed'],
    ['HOSTILES DOWN', String(summary.kills)],
    ['LEVIATHAN', bossValue, summary.bossTimeSec !== null ? 'time to destroy' : summary.bossEngaged ? 'combined shield + hull' : undefined],
    ['SYSTEMS KNOCKED OUT', `${summary.subsystemsDestroyed} / ${summary.subsystemsTotal || 4}`],
  ];
  const badges = [lastRecordUpdate?.newBestRank ? 'NEW BEST RANK' : '', lastRecordUpdate?.newFastestBoss ? 'FASTEST LEVIATHAN KILL' : '', won && lastRecordUpdate?.newBestScore ? 'NEW HIGH SCORE' : ''].filter(Boolean);
  const record = records[state.ship];
  const recordLine = record.bestRank ? `BEST WITH THIS SHIP · RANK ${record.bestRank}${record.fastestBossSec !== null ? ` · ${formatDuration(record.fastestBossSec)}` : ''} · ${record.wins} WIN${record.wins === 1 ? '' : 'S'}` : '';
  el('result-records').innerHTML = `${badges.map(b => `<span class="badge">${b}</span>`).join('')}${recordLine ? `<small>${recordLine}</small>` : ''}`;
  target.innerHTML = `<div class="rank ${rank === '—' ? 'unranked' : ''}" data-rank="${rank}"><span>MISSION RANK</span><b>${rank}</b></div><dl>${rows.map(([label, value, note]) => `<div><dt>${label}</dt><dd>${value}</dd>${note ? `<small>${note}</small>` : ''}</div>`).join('')}</dl>`;
}
function showChapterResult(state: GameSnapshot, chapter: ChapterDef, won: boolean) {
  const summary = state.summary;
  const next = getChapterByNumber(chapter.number + 1);
  lastChapterResult = undefined;
  let rank = '—';
  if (won) {
    const result = { timeSec: summary?.durationSec ?? chapter.parTimeSec, damageTaken: summary?.damageTaken ?? 0, maxDurability: state.maxHull + state.maxShield, accuracy: summary?.accuracy ?? 0, score: state.score };
    rank = getChapterRank(chapter, result);
    lastChapterResult = completeChapter(campaign, chapter, result);
    campaign = lastChapterResult.progress;
    saveProgress(campaign, safeStorage);
    const upgrade = lastChapterResult.rewardGranted?.upgrade;
    if (upgrade) game?.grantUpgrade(upgrade);
    selectedChapter = next ? next.number : chapter.number;
    renderChapters();
  }
  const padded = String(chapter.number).padStart(2, '0');
  text('result-eyebrow', won ? `CHAPTER ${padded} / ${chapter.codename.toUpperCase()} / COMPLETE` : `CHAPTER ${padded} / ${chapter.codename.toUpperCase()} / FAILED`);
  el('result-title').innerHTML = won ? `${chapter.title.toUpperCase()}<br><span>CLEARED.</span>` : 'MISSION<br><span>FAILED.</span>';
  text('result-copy', won ? chapter.debrief : state.campaign?.failReason ? `${state.campaign.failReason.toLowerCase().replace(/^./, c => c.toUpperCase())}. Regroup and try again.` : state.message || 'Your craft was lost. Regroup and try again.');
  text('retry-label', won ? `REPLAY CHAPTER ${chapter.number}` : `RETRY CHAPTER ${chapter.number}`);
  text('next-chapter-label', next ? `NEXT · CHAPTER ${next.number} — ${next.title.toUpperCase()}` : 'CAMPAIGN COMPLETE');
  show('next-chapter', won && !!next);
  const target = el('result-breakdown');
  if (!summary) { target.innerHTML = ''; el('result-records').innerHTML = ''; return; }
  const reward = lastChapterResult?.rewardGranted;
  const rows: [string, string, string?][] = [
    ['FLIGHT TIME', formatDuration(summary.durationSec), `PAR ${formatDuration(chapter.parTimeSec)}`],
    ['ACCURACY', `${Math.round(summary.accuracy * 100)}%`, `${summary.shotsHit} / ${summary.shotsFired} shots`],
    ['DAMAGE TAKEN', String(Math.round(summary.damageTaken)), 'shield + hull absorbed'],
    ['HOSTILES DOWN', String(summary.kills)],
    ['REWARD', won ? (reward ? (reward.upgrade ? `+1 ${UPGRADE_LABEL[reward.upgrade]}` : reward.label.toUpperCase()) : 'CLAIMED') : '—', won ? chapter.reward.label : undefined],
    ['NEXT', won && next ? `CHAPTER ${next.number}` : won ? 'FINALE DONE' : '—', won && next ? next.title : undefined],
  ];
  const badges = [lastChapterResult?.firstClear ? 'FIRST CLEAR' : '', lastChapterResult?.newRank && !lastChapterResult.firstClear ? 'NEW BEST RANK' : '', lastChapterResult?.newBestTime && !lastChapterResult.firstClear ? 'NEW BEST TIME' : '', lastChapterResult?.unlockedNext && next ? `CHAPTER ${next.number} UNLOCKED` : '', reward?.upgrade ? `${UPGRADE_LABEL[reward.upgrade]} UPGRADE INSTALLED` : ''].filter(Boolean);
  el('result-records').innerHTML = badges.map(b => `<span class="badge">${b}</span>`).join('');
  target.innerHTML = `<div class="rank ${rank === '—' ? 'unranked' : ''}" data-rank="${rank}"><span>CHAPTER RANK</span><b>${rank}</b></div><dl>${rows.map(([label, value, note]) => `<div><dt>${label}</dt><dd>${value}</dd>${note ? `<small>${note}</small>` : ''}</div>`).join('')}</dl>`;
}
let bossBannerTimer = 0;
let resultsTimer = 0;
function hideBossBanner() { window.clearTimeout(bossBannerTimer); el('boss-banner').classList.add('hidden'); }
function showBossBanner(kicker: string, title: string, copy: string, tone: 'alert' | 'critical' | 'chapter') {
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
    show('pause', state.mode === 'paused'); show('results', false); window.clearTimeout(resultsTimer); show('pause-button', state.mode === 'playing');
    document.body.dataset.mode = state.mode;
    if (state.mode === 'menu') hideBossBanner();
    if (state.mode === 'paused') el('resume').focus();
    if (state.mode === 'menu') { shipDetails(); renderChapters(); text('best', best.toLocaleString()); el(menuMode === 'campaign' ? 'launch-chapter' : 'launch').focus({ preventScroll: true }); }
    if (state.mode === 'ended') {
      const won = state.result === 'victory';
      const chapter = activeChapter;
      if (chapter) showChapterResult(state, chapter, won);
      else {
        text('result-eyebrow', won ? 'BLOCKADE BROKEN / MISSION COMPLETE' : 'SIGNAL LOST / MISSION ENDED');
        el('result-title').innerHTML = won ? 'FRONTIER<br><span>LIBERATED.</span>' : 'LOST TO<br><span>THE VOID.</span>';
        text('result-copy', won ? 'You made the impossible look inevitable. Welcome home, pilot.' : 'Every legend starts with another attempt. Your squadron awaits.');
        text('retry-label', 'DEPLOY AGAIN'); show('next-chapter', false);
        if (state.summary) {
          lastRecordUpdate = updateRecords(records, state.ship, { victory: won, rank: getMissionRank(state.summary, won), bossTimeSec: state.summary.bossTimeSec, score: state.score });
          records = lastRecordUpdate.records;
          saveRecords(records);
          renderBests();
        } else lastRecordUpdate = undefined;
        renderBreakdown(state, won);
      }
      text('final-score', state.score.toLocaleString()); text('final-kills', state.kills);
      best = Math.max(best, state.score);
      try { localStorage.setItem('void-squadron-best', String(best)); } catch { /* The game remains playable without persistence. */ }
      resultsTimer = window.setTimeout(() => { if (latest?.mode === 'ended') { show('results', true); el(won && chapter && getChapterByNumber(chapter.number + 1) ? 'next-chapter' : 'retry').focus(); } }, won ? 0 : 2300);
    }
  }
  if (state.mode === 'playing' || state.mode === 'paused') drawRadar();
  text('capture-indicator', state.captureActive ? `M · MOUSE CAPTURED · ${mouseSensitivity.toFixed(1)}×` : `M · MOUSE FREE · ${mouseSensitivity.toFixed(1)}×`);
  el('capture-indicator').classList.toggle('captured', Boolean(state.captureActive));
  el('settings-open').setAttribute('title', `${state.difficulty || difficulty} difficulty · mouse ${state.captureActive ? 'captured' : 'free'}`);
  const torpCap = state.torpedoCapacity ?? 0;
  el('orow-torp').classList.toggle('hidden', torpCap === 0);
  if (torpCap > 0) {
    const pips = `${'<i class="on"></i>'.repeat(state.torpedoes ?? 0)}${'<i></i>'.repeat(Math.max(0, torpCap - (state.torpedoes ?? 0)))}`;
    if (el('torp-pips').innerHTML !== pips) el('torp-pips').innerHTML = pips;
    el('orow-torp').classList.toggle('empty', (state.torpedoes ?? 0) === 0);
  }
  el('orow-oc').classList.toggle('hidden', !(state.overcharge && state.overcharge > 0));
  if (state.overcharge) { el('oc-bar').style.width = `${Math.min(100, state.overcharge / 12 * 100)}%`; text('oc-time', `${state.overcharge.toFixed(1)}s`); }
  el('orow-ae').classList.toggle('hidden', !(state.aegis && state.aegis > 0));
  if (state.aegis) { el('ae-bar').style.width = `${Math.min(100, state.aegis / 144 * 100)}%`; text('ae-val', String(state.aegis)); }
  const auto = state.autoMode ?? 'off';
  el('assist-auto').classList.toggle('active', auto === 'autopilot'); el('assist-combat').classList.toggle('active', auto === 'combat');
  text('assist-auto-info', auto === 'autopilot' ? state.autoStatus ?? '' : ''); text('assist-combat-info', auto === 'combat' ? state.autoStatus ?? '' : '');
  el('assist-target').classList.toggle('active', !!state.target);
  text('assist-target-info', state.target ? `${state.target.name} · ${formatSpaceDistance(state.target.distance)}` : '');
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
  if (!boss && el('boss-banner').dataset.tone !== 'chapter') hideBossBanner();
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
  const camp = state.campaign ?? null;
  el('objective-card').classList.toggle('hidden', !camp);
  document.querySelector('.hud-mission')!.classList.toggle('hidden', !!camp);
  if (camp) {
    const chapter = activeChapter;
    const stage = chapter?.stages[camp.stageIndex];
    if (chapter && state.mode === 'playing' && (!previous?.campaign || previous.mode === 'menu' || previous.mode === 'ended')) showBossBanner(`CHAPTER ${String(chapter.number).padStart(2, '0')} · ${chapter.codename.toUpperCase()}`, chapter.title.toUpperCase(), chapter.briefing[0], 'chapter');
    else if (chapter && stage && previous?.campaign && previous.campaign.stageIndex !== camp.stageIndex) showBossBanner(`STAGE ${camp.stageIndex + 1} / ${camp.stageCount}`, stage.label.toUpperCase(), camp.hint, 'chapter');
    el('objective-card').classList.toggle('urgent', camp.hud.urgent);
    text('ob-chapter', camp.hud.title); text('ob-stage', `${Math.round(camp.hud.fraction * 100)}%`);
    text('ob-line', camp.hud.line); text('ob-hint', camp.hint);
    el('ob-progress').style.width = `${Math.round(camp.hud.fraction * 100)}%`;
    const detection = camp.detection;
    el('ob-det-row').classList.toggle('hidden', detection === undefined);
    if (detection !== undefined) { el('ob-det').style.width = `${Math.round(detection * 100)}%`; el('ob-det-row').classList.toggle('hot', detection > 0.7); text('ob-det-val', `${Math.round(detection * 100)}%`); }
    const asset = camp.assetHull;
    el('ob-asset-row').classList.toggle('hidden', !asset);
    if (asset) { const pct = Math.max(0, Math.round(asset.current / asset.max * 100)); el('ob-asset').style.width = `${pct}%`; el('ob-asset-row').classList.toggle('hot', pct < 30); text('ob-asset-val', `${pct}%`); }
    const left = camp.timeRemainingSec;
    el('ob-time-row').classList.toggle('hidden', left === null);
    if (left !== null) { text('ob-time', formatDuration(Math.max(0, Math.ceil(left)))); el('ob-time-row').classList.toggle('hot', left < 20); }
  }
  el('speed').parentElement!.parentElement!.classList.toggle('braking', Boolean(state.braking));
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
  for (const id of ['launch', 'launch-chapter']) { el(id).textContent = '3D GRAPHICS UNAVAILABLE'; (el(id) as HTMLButtonElement).disabled = true; }
  document.querySelectorAll('.launch-hint').forEach(hint => { hint.textContent = 'Enable WebGL / hardware acceleration, then reload this page.'; });
  console.error('Unable to initialize the 3D renderer:', error);
}
el('launch').addEventListener('click', () => launch());
el('launch-chapter').addEventListener('click', launchMenuSelection);
el('retry').addEventListener('click', () => launch(activeChapter));
el('next-chapter').addEventListener('click', () => { const next = activeChapter ? getChapterByNumber(activeChapter.number + 1) : undefined; if (next) { selectedChapter = next.number; launch(next); } });
el('chapter-rail').addEventListener('click', event => { const node = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-chapter]'); if (node) selectChapter(Number(node.dataset.chapter)); });
document.querySelectorAll<HTMLButtonElement>('.mode-tab').forEach(tab => tab.addEventListener('click', () => setMenuMode(tab.dataset.mode as 'campaign' | 'arcade')));
setMenuMode(menuMode);
renderChapters();
window.setTimeout(applyThumbnails, 60);
el('resume').addEventListener('click', () => {
  game?.resume();
  if (mouseCaptureEnabled) (game as SettingsEngine | undefined)?.requestMouseCapture?.();
});
for (const id of ['abort', 'return']) el(id).addEventListener('click', () => game?.returnToMenu());
el('pause-button').addEventListener('click', () => game?.pause());
el('ship-list').addEventListener('click', event => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-ship]'); if (button) selectShip(button.dataset.ship as ShipClass); });
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
  text('sensitivity-value', `${mouseSensitivity.toFixed(1)}×`);
  game?.setMouseSensitivity(mouseSensitivity);
});
for (const [id, key] of [['star-density', 'starDensity'], ['panel-translucency', 'translucency'], ['panel-rounding', 'rounding']] as const) {
  el(id).addEventListener('input', () => { uiSettings[key] = Number((el(id) as HTMLInputElement).value); applyUiSettings(true); });
}
applyUiSettings();
el('difficulty').addEventListener('change', () => { difficulty = (el('difficulty') as HTMLSelectElement).value as typeof difficulty; applySettings(); });
for (const [id, setter] of [['collisions-setting', (value: boolean) => { collisionsEnabled = value; }], ['damage-setting', (value: boolean) => { damageEnabled = value; }], ['capture-setting', (value: boolean) => { mouseCaptureEnabled = value; }]] as const) {
  el(id).addEventListener('change', () => { setter((el(id) as HTMLInputElement).checked); applySettings(); });
}
for (const [id, action] of [['assist-target', () => game?.cycleTarget()], ['assist-auto', () => game?.toggleAutoMode('autopilot')], ['assist-combat', () => game?.toggleAutoMode('combat')]] as const) {
  el(id).addEventListener('click', () => { action(); (el(id) as HTMLButtonElement).blur(); });
}
function updateTargetOverlay() {
  const box = el('target-box'), arrow = el('target-arrow'), lead = el('target-lead');
  const guidance = latest?.mode === 'playing' ? game?.getTargetGuidance() : null;
  if (!guidance) { box.classList.add('hidden'); arrow.classList.add('hidden'); lead.classList.add('hidden'); return; }
  const w = window.innerWidth, h = window.innerHeight;
  const isObjective = guidance.kind === 'objective';
  const tone = isObjective ? '#62d9ff' : guidance.hostile ? '#ff5d7a' : '#ffbf69';
  box.classList.toggle('objective', isObjective);
  const dist = formatSpaceDistance(guidance.distance);
  if (guidance.onScreen) {
    arrow.classList.add('hidden'); box.classList.remove('hidden');
    box.style.setProperty('--tc', tone);
    box.style.width = box.style.height = `${guidance.boxPx}px`;
    box.style.transform = `translate(${guidance.x - guidance.boxPx / 2}px, ${guidance.y - guidance.boxPx / 2}px)`;
    text('tb-name', guidance.name); text('tb-dist', dist);
    text('tb-detail', `${guidance.detail}${guidance.closing > 1 ? ` · CLOSING ${Math.round(guidance.closing)} KM/S` : guidance.closing < -1 ? ` · OPENING ${Math.round(-guidance.closing)} KM/S` : ''}`);
    el('tb-shield').style.width = `${guidance.shieldPct}%`; el('tb-hull').style.width = `${guidance.hullPct}%`;
    if (guidance.lead) { lead.classList.remove('hidden'); lead.style.setProperty('--tc', tone); lead.style.transform = `translate(${guidance.lead.x}px, ${guidance.lead.y}px)`; } else lead.classList.add('hidden');
  } else {
    box.classList.add('hidden'); lead.classList.add('hidden'); arrow.classList.remove('hidden');
    arrow.style.setProperty('--tc', tone);
    const dx = Math.cos(guidance.edgeAngle), dy = -Math.sin(guidance.edgeAngle), margin = 92;
    const t = Math.min((w / 2 - margin) / Math.max(1e-3, Math.abs(dx)), (h / 2 - margin) / Math.max(1e-3, Math.abs(dy)));
    arrow.style.transform = `translate(${w / 2 + dx * t}px, ${h / 2 + dy * t}px)`;
    (arrow.querySelector('svg') as SVGElement).style.transform = `rotate(${-guidance.edgeAngle}rad)`;
    (arrow.querySelector('.ta-label') as HTMLElement).style.transform = `translate(${-dx * 74}px, ${-dy * 38}px)`;
    text('ta-name', guidance.name); text('ta-dist', dist); text('ta-turn', `TURN ${guidance.instruction}`);
  }
}
(function targetLoop() { updateTargetOverlay(); requestAnimationFrame(targetLoop); })();
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
  if (!latest || latest.mode === 'menu') {
    const keys = Object.keys(SHIPS) as ShipClass[];
    const digit = /^Digit([1-6])$/.exec(event.code);
    if (digit) { event.preventDefault(); selectShip(keys[Number(digit[1]) - 1]); return; }
    if (menuMode === 'campaign' && (event.code === 'BracketRight' || event.code === 'BracketLeft')) { event.preventDefault(); selectChapter(selectedChapter + (event.code === 'BracketRight' ? 1 : -1)); return; }
    if (event.code === 'ArrowRight' || event.code === 'ArrowLeft') {
      event.preventDefault();
      selectShip(keys[(keys.indexOf(selected) + (event.code === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length]);
      return;
    }
  }
  if (event.code === 'Enter' && (!latest || latest.mode === 'menu') && ((event.target as HTMLElement).matches('body, [data-ship], [data-chapter], .mode-tab'))) { event.preventDefault(); if (!(menuMode === 'campaign' && (el('launch-chapter') as HTMLButtonElement).disabled)) launchMenuSelection(); }
  if (latest?.mode === 'playing') {
    if (event.code === 'KeyT') { event.preventDefault(); if (event.shiftKey) game?.clearTarget(); else game?.cycleTarget(); return; }
    if (event.code === 'KeyP') { event.preventDefault(); game?.toggleAutoMode('autopilot'); return; }
    if (event.code === 'KeyC') { event.preventDefault(); game?.toggleAutoMode('combat'); return; }
  }
  if (event.code === 'Escape') {
    if (latest?.mode === 'playing') { event.preventDefault(); game?.pause(); }
    else if (latest?.mode === 'paused') { event.preventDefault(); game?.resume(); }
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && latest?.mode === 'playing') game?.pause(); });
window.addEventListener('pagehide', event => { if (!event.persisted) game?.dispose(); else game?.pause(); });
if (import.meta.hot) import.meta.hot.dispose(() => game?.dispose());
