# VOID SQUADRON

An original cinematic browser-based 3D space shooter. Built with TypeScript, Three.js, and Tailwind CSS. All spacecraft, planets, nebulae, asteroids, visual effects, and audio are generated locally — no ripped game assets or asset services. The UI typefaces (Chakra Petch and JetBrains Mono, SIL OFL) are bundled from `@fontsource` packages, and the narration clips are pre-rendered with Microsoft neural TTS voices and stored in the repository; nothing is fetched from a CDN or speech service at runtime.

## Run locally

Requires Node.js 22.18+ and npm.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5301. Both development and preview default to port 5301 and fail if it is occupied rather than silently choosing another port. Stop the development server before starting preview. For a production build:

```sh
npm run build
npm run preview
```

Run the pure gameplay-rule tests with `npm test`.

## Mission

The start screen is a single fullscreen composition with no scrolling on desktop: mission briefing and launch button on the left, a live 3D scene in the middle (your craft rotates and banks on a dock cradle beside a rotating ring station with blinking lights and escorts flying past), and a **ship dossier** on the right with role, description, relative stat bars (hull, shield, speed, armor, firepower; amber segments show your permanent upgrades), upgrade pips and your personal record. A compact row of six spacecraft cards (with images rendered from the real 3D models) sits along the bottom; click one, press **1–6**, or use **← →** to switch. On tablets and phones the same content stacks into a scrolling layout. Press **Launch Mission** or Enter to deploy. This launches Operation Shattered Orbit. Destroy combat hostiles in five increasingly difficult waves to break the blockade. Non-attacking shuttles and freighters try to escape and are optional bonus targets, not wave blockers. Interceptors chase aggressively, fighters perform attack runs, and heavy warships turn more slowly. Disengage far from the battle to break pursuit and collect shield, energy, and hull-repair supplies in recovery pockets or dropped by destroyed ships. Fly in any direction, turn around to chase an opponent, and evade pursuit in a true three-dimensional arena. Hostiles no longer disappear behind the camera or clear a wave merely by passing you. Your best score is saved in browser local storage when a mission ends (when storage is available).

### Music and narration

- **Music** (`src/music.ts`) is an original score synthesized live with the Web Audio API (no samples): a floating pad-and-arpeggio theme in the hangar, a driving combat track whose drums and stabs scale with the number of hostiles, a sparse tense cue for stealth stages, a heavier track for the Leviathan, plus a fanfare on victory and a slow dirge on defeat. The score ducks under narration and halves when paused.
- **Narration** (`src/narration.ts`, `src/voiceLines.ts`) uses pre-rendered **Microsoft neural voices**: *Command* (en-US-ChristopherNeural) reads chapter briefings, debriefs and wave calls; the *onboard AI* (en-US-AriaNeural) reports shields, hull, throttle, target locks, upgrades and stealth detection; the *wingman* (en-US-GuyNeural) shouts boss phases, salvage and raids. Computer and wingman go through a cockpit-radio filter. Lines have priorities (critical calls interrupt, chatter is dropped when busy) and per-line cooldowns, and a subtitle bar shows the spoken text.
- The clips are static MP3s in `public/audio/voice` (about 2 MB), so nothing is fetched from Microsoft at play time. To change or add lines, edit `src/voiceLines.ts` and run `node --experimental-strip-types scripts/generate-voice.mjs` (needs network access; `--force` re-renders everything). A test fails when a line has no clip.
- Settings: **Music volume**, **Narration volume** and **Subtitles**. The SOUND button mutes everything. Browsers keep audio locked until your first click or key press, so music and the welcome line start then.

### Salvage drops

Destroyed spacecraft eject salvage pods (`src/drops.ts`): bigger wrecks roll more often (destroyers up to 3 pods). Each pod is usually a recovery supply weighted toward what you are missing, sometimes a **temporary** combat boost (torpedoes, overcharge, aegis) and rarely a **permanent** hull/defense/attack upgrade (at most one per wreck, only while that track is not maxed). Wrecks you did not shoot down drop half as often.

### Campaign

The start screen has two tabs. **Campaign** is seven chapters, each with a different objective type; **Arcade** is the original five-wave *Operation Shattered Orbit* ending with the Leviathan.

| # | Chapter | Objective | Notes |
| --- | --- | --- | --- |
| 1 | Ember Wake | Eliminate a raider patrol | Gentle opener |
| 2 | Silent Choir | Scan three beacons, then **infiltrate** a listening-post sensor net | Hold speed under the scan limit (Z), then creep: detection rises with speed, boost and firing; one alarm is forgiven |
| 3 | Glass Harvest | Retrieve artefacts and extract | Wreck-field salvage |
| 4 | Relay at Dusk | Defend a relay tender until the convoy jumps | Raiders hunt the asset, its hull bar is on the HUD |
| 5 | Stone Tempest | Race through asteroid gates | Par time under 90 s |
| 6 | Crown of Knives | Hunt three named ace raiders | Escorts arrive in a trickle |
| 7 | Leviathan Falls | Destroy the Leviathan | Final chapter |

Chapters unlock in order. The first clear of a chapter grants a permanent upgrade (hull, defense or attack) on the ship you flew, and each chapter keeps a best rank (S–C, from time against par, damage taken and accuracy) and best time. Progress is stored locally (`void-squadron.campaign.v1`). The in-flight **objective card** shows chapter, stage, progress, a detection bar during stealth, asset hull while defending, and a countdown when a stage is timed; objectives also appear on the radar (cyan ⌖) and guide the targeting arrow when nothing is locked. Objective layouts are shrunk to fit inside the play volume. Chapter content lives in `src/campaign.ts` and is covered by `src/campaign.test.ts`.

### Controls

| Input | Action |
| --- | --- |
| Mouse / WASD / arrow keys | Yaw and pitch; forward thrust follows the nose |
| Scroll wheel / Q / E | Roll around the ship’s forward axis |
| Hold left mouse / Space | Fire primary weapons |
| Hold Shift | Boost while energy is available |
| R / F | Raise / lower engine **throttle** (100% down to a dead stop); Z = all stop. Shift boost overrides throttle |
| + / − | Zoom the radar in / out |
| X / right mouse | Fire a homing **proton torpedo** (fighter 4, interceptor 0, bomber 8, shuttle 0, freighter 0, destroyer 6) |
| M | Toggle mouse capture; during menus enables it for next launch |
| Escape | Pause / resume |
| T / Shift+T | Lock a target (nearest to your nose first, then cycle) / clear the lock; clicking a radar contact also locks it |
| P | Toggle **autopilot** (flies to the target, nearest hostile or useful supply; never fires) |
| C | Toggle **autocombat** (hunts, aims with lead, fires, evades, boosts, retreats to supplies when hurt) |
| 1–6 / ← → (start screen) | Pick a spacecraft; the dossier and 3D preview update |
| [ / ] (start screen, Campaign tab) | Browse chapters |
| Enter / launch button | Launch the selected chapter or arcade mission |
| SOUND | Toggle synthesized audio |
| FX | Toggle high / performance rendering |
| BOUNDS | Toggle collision-sphere visualization (off by default) |

On touchscreens, drag on the space view to steer and fire. Keyboard and mouse on desktop are recommended. Opening another tab pauses the mission.

### Game settings

**Interface settings** (saved locally): *Starfield density* (0–200%, scales the sky stars and the streaking motion stars), *Panel translucency* (0–80%, applies to every HUD card, panel and dialog) and *Panel rounding* (0–24 px; 0 keeps the sharp chamfered look and is the default).

Open **SETTINGS** to select Relaxed, Standard, or Veteran difficulty. **Physical collisions** toggles impacts with spacecraft, asteroids, planets, and carriers. **Player damage** independently toggles incoming hull/shield damage; your weapons, power-up collection, and recovery remain active. **Capture mouse** locks and hides the cursor for relative mouse steering after Launch/Resume; Escape releases capture and pauses. Use **M** to toggle capture during flight. The **Mouse Sensitivity** slider (**0.5× to 10×**, default **5×**) scales both captured relative steering and free-cursor steering (a gain of 0.6× per step, so the default 5× reaches full turn rate at about a third of the half-screen deflection), without altering keyboard steering. The HUD indicates the actual capture state and current sensitivity. Browsers may deny pointer lock; normal steering remains available.

### Targeting and pilot assists

- **Targeting (T):** locks the hostile closest to your nose, then cycles outward on each press (Shift+T clears; destroyed targets clear themselves). You can also click any hostile on the radar. A bracket marks the target with its name, range, closing speed, state and shield/hull bars; a **lead pip** shows where to aim to hit it. When the target is off-screen an **edge arrow** points the way and spells out the turn ("TURN LEFT 121° · UP 10°"). While the Leviathan is alive it can be targeted too; the lock follows the best subsystem (nearest shield dome, then the bridge).
- **Autopilot (P):** flies to your target, or otherwise the nearest hostile, the capital ship, a useful supply or the battle zone, without firing. It steers around asteroids, ships, the planet and the carrier hull using closest-approach prediction.
- **Autocombat (C):** everything autopilot does plus lead-aimed firing when lined up, boosting to close distance, and evasion. Below 45% durability it retreats and collects supplies until it recovers to 80%. Against the Leviathan it hunts escorts first, then attacks shield domes and the bridge.
- **Taking control back:** press P/C again, or touch any steering key (WASD, arrows, Q/E), or move the captured mouse a lot. The assist bar above the playfield shows each mode and what it is doing. Assists are an aid, not an ace: in headless test runs autocombat clears the Leviathan alone about 7 times in 8 but still loses regular dogfights fairly often, so keep an eye on it.

### Tactical radar


The ship-relative scanner defaults to **1,000 km**, with +/− controls to zoom between **250 and 8,000 km**. One simulation world unit represents one kilometer; speed is shown in km/s. This is a consistent arcade space scale, not realistic orbital physics. The scanner maps nearby contacts; distant contacts remain on its edge to help locate the last combat ships. Red filled diamonds are hostiles, amber outlined diamonds are optional fleeing ships, cyan crosses are supplies, and pink markers are the Wave 5 capital ship and its subsystems. The top of the map is ahead, the bottom behind; ▲/▼ marks contacts above/below your flight plane. The scanner follows yaw, pitch, and roll and reports the nearest hostile's range.

### Spacecraft

Six original classes are selectable: **fighter, interceptor, bomber, shuttle, freighter, and destroyer**. Each has different hull, shield, armor, mass, speed, fire rate, and weapon damage. Their combat profiles live in `src/rules.ts`.

### Permanent upgrades

Each spacecraft has separate **Hull / Defense / Attack** upgrade tracks, saved locally between missions. Upgrade pickups stack up to level **10**; each level adds **10% of that ship's base** maximum hull, shield capacity, or weapon damage. The HUD displays three cumulative progression bars, levels, and effective combat stats. Repair/energy pickups remain separate: they restore current resources but do not add upgrade levels. Upgrades persist only in this browser; blocked storage still permits play but cannot retain progress after reload. At mission launch, the average upgrade level sets capped encounter scaling: up to **30% more combat ships** (rounded down), **20% stronger enemy hull/shields**, and **10% stronger enemy weapons**. Extra combat slots favor interceptors and later-wave bombers. Difficulty still applies separately, and mid-mission upgrades do not raise the current mission's enemy scaling.

### Wave 5: The Leviathan

Wave 5 adds a capital-ship boss, **The Leviathan** (Class VII blockade carrier), that jumps in about 190 km ahead of you alongside the usual escort wave. The fight is won by destroying the boss, not by clearing the escorts.

- **Subsystems:** two **shield domes** (350 HP each), the **ventral flight deck** (500 HP) and the **command bridge** (600 HP). Destroying a dome strips half of the boss's 1,600 shield; destroying both drops it to zero. While a dome stands, shots at the bridge are deflected into the shield. Destroying the bridge destroys the ship. Destroying the flight deck deals 60% of its HP as collateral hull damage and silences the ventral turrets.
- **Main hull:** shots that miss the subsystems and strike the hull only do 30% damage. Subsystems are the intended route.
- **Turrets:** eight batteries fire aimed, partially lead-corrected volleys within 320 km (lead quality scales with difficulty: Relaxed 62%, Standard 75%, Veteran 82%). They fire faster once shields drop (×1.25) and again when the hull is critical (×1.6). Larger ships get a wider boss-fire spread so hitbox size does not dominate survivability.
- **Escorts:** the Wave 5 escort roster is capped (**3 / 5 / 7** combat ships on Relaxed / Standard / Veteran, heaviest dropped first), arrives after a 5 s lead-in about every 3.4 s, never exceeds **1 / 2 / 3 alive at once**, and hits 20% softer while the carrier lives. Civilians still flee as bonus targets.
- **Upgrade scaling:** the boss uses the same encounter scaling as other enemies: up to **+20% shield, hull and subsystem HP**, **+10% turret damage**, and up to ~15% faster turret cycles at maximum upgrades.
- **Phases:** `SHIELDED → SHIELDS DOWN → CRITICAL → DESTROYED`. Each change raises a HUD banner and a stinger; a low drone intensifies with the phase. The boss card shows shield/hull bars and four subsystem chips; the radar marks the carrier (pink square) and live subsystems (pink dots). Destroyed subsystems drop shield and hull pickups.
- **Visuals:** twin-barrel turrets track you and charge/flash when firing; a translucent shield bubble fades with remaining shield; destroyed systems burn and smoke, and the hull vents fire below 50%.

**Balance:** all numbers live in `src/capital.ts` (`BOSS_TUNING`, `BOSS_DIFFICULTY`, escort limits) and are covered by `src/capital.test.ts`. They were tuned with headless autopilot runs inside the real game loop (no rendering), using damage-on fights against the boss and its escorts. Two pilot models were used: a pinned orbit at 110 km that weaves by a configurable amount (boss-only), and the same orbit with lead-aimed gunnery against escorts. Results with a competent pilot at upgrade level 0: **Relaxed** and **Standard** win about every run on fighter, bomber and destroyer, **Veteran** wins roughly 30–85% of runs depending on ship, and fights last 30–55 s. At upgrade levels 5 and 10 the pilot wins more comfortably (more HP left), consistent with the rule that encounter scaling stays below player upgrade gains. A pilot that flies a steady straight line is shredded by design: the turrets lead your motion, so weaving matters. These are simulations, not human playtests; adjust the constants if real play feels off.

### Results breakdown

The results screen (victory or defeat) shows flight time, accuracy (shots hit / fired), damage taken (shield + hull absorbed, including regenerated shield), hostiles destroyed, Leviathan time-to-destroy or remaining health, and how many of its four systems you knocked out. Victories also get a **mission rank**: S/A/B/C from accuracy, damage taken, boss kill time and systems destroyed (defeats are unranked). Helpers and thresholds are in `src/summary.ts`, covered by `src/summary.test.ts`.

### Personal records

Each spacecraft keeps its own record in browser local storage: **best mission rank, fastest Leviathan kill, best score and victory count**. The hangar cards show the best rank and boss time (or UNRANKED), and the results screen flags **NEW BEST RANK**, **FASTEST LEVIATHAN KILL** and **NEW HIGH SCORE** when you beat a record. Only victories update rank, boss time and wins; defeats only update the best score. Corrupt or unavailable storage falls back to empty records without breaking play. Logic lives in `src/records.ts`, covered by `src/records.test.ts`.

### Explosions

Destroyed ships, asteroids, boss systems and your own ship trigger a layered blast: a white-hot flash, soft additive fireballs that cool from white through orange to red, smoke puffs, expanding shockwave rings, tumbling debris that glows and cools, round spark showers, and secondary blasts. **Lethal collisions** are bigger and more violent (more debris, an extra shockwave, up to several secondary blasts) and shake the camera in proportion to distance. When your ship is destroyed, time slows briefly (about 1.4–2 s) while the blast plays; the results screen follows about 2.3 s later. Asteroid blasts use rocky debris and brown smoke. At most 14 blasts run at once to protect frame rate.

### Collision mechanics

Asteroid and spacecraft impacts use relative velocity, mass, and armor to determine damage. Shields absorb incoming damage before the hull; a quiet interval allows shield regeneration, but hull damage is permanent. Impact separation and contact cooldowns prevent a single overlap from applying damage every frame. Boosting into an asteroid is especially dangerous for a lightly armored interceptor.

## Architecture

- `src/main.ts` — hangar, flight manual, HUD, pause/results, high-score persistence.
- `src/style.css` — Tailwind import and cinematic responsive interface styling.
- `src/game.ts` — render loop, free-flight scene, chase camera, enemy pursuit, input, combat, waves, lifecycle.
- `src/flight.ts` — pure 3D flight and collision mathematics.
- `src/flight.test.ts` — flight orientation, pursuit, and collision regression tests.
- `src/models.ts` — original procedural spacecraft and environmental models.
- `src/rules.ts` — ship profiles, pure combat/collision rules, and the shared pickup color table.
- `src/pilot.ts` — pure autopilot helpers: steering, closest-approach collision prediction, retreat latch, bearings.
- `src/pilot.test.ts` — pilot helper tests.
- `src/capital.ts` — Leviathan boss subsystems, turrets, phases, and balance tuning.
- `src/capital.test.ts` — boss mechanics and tuning regression tests.
- `src/summary.ts` — mission summary, accuracy, duration formatting and ranking.
- `src/summary.test.ts` — summary and ranking tests.
- `src/records.ts` — per-ship persistent records (rank, boss time, score, wins).
- `src/records.test.ts` — records persistence and update tests.
- `src/campaign.ts` — pure campaign module: the seven chapters, stage trackers (eliminate, scan, stealth, retrieve, defend, navigate, hunt, boss), layouts, ranks and progress persistence.
- `src/campaign.test.ts` — campaign tests.
- `src/drops.ts` / `src/drops.test.ts` — salvage drop tables and rolls.
- `src/music.ts` — procedural score director; `src/narration.ts` — voice clip player; `src/voiceLines.ts` — narration script and voice assignments; `scripts/generate-voice.mjs` — clip generator.
- `src/station.ts` — procedural space station and dock cradle used by the start screen.
- `src/menuMotion.ts` — pure choreography helpers for the start-screen hero craft, escorts and camera.
- `src/thumbnails.ts` — renders the hangar tile images from the real 3D models.
- `src/audio.ts` — locally synthesized combat audio.
- `src/rules.test.ts` — gameplay-rule regression tests.

Shields have no visible bubble by default: impact flashes overlay spacecraft surfaces. The BOUNDS setting enables optional collision-sphere visualization without changing physics. The background ocean planet uses procedural continents, cloud cover, a day/night terminator, and a thin atmospheric rim.

WebGL and hardware acceleration are required. If graphics initialization fails, the launcher displays an actionable fallback. Lower FX on slower devices. The game uses arcade-style 3D free flight with continuous forward thrust and a chase camera, not physically accurate orbital mechanics.

## Asset provenance

This is an original space-opera universe, not an official or licensed Star Wars game. The copyrighted preview images and ripped models originally suggested were not downloaded or used. No third-party branded ship designs, characters, storylines, music, or logos are included.
