# VOID SQUADRON

An original cinematic browser-based 3D space shooter. Built with TypeScript, Three.js, and Tailwind CSS. All spacecraft, planets, nebulae, asteroids, visual effects, and audio are generated locally — no ripped game assets, external fonts, or asset services.

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

Choose a spacecraft in the hangar to update its live 3D preview and stats, then click **Launch Mission** or **Deploy Selected Ship**. Enter also launches when a spacecraft tile has focus. The hangar scrolls on smaller windows so the mission controls and spacecraft cards never overlap. This launches Operation Shattered Orbit. Destroy combat hostiles in five increasingly difficult waves to break the blockade. Non-attacking shuttles and freighters try to escape and are optional bonus targets, not wave blockers. Interceptors chase aggressively, fighters perform attack runs, and heavy warships turn more slowly. Disengage far from the battle to break pursuit and collect shield, energy, and hull-repair supplies in recovery pockets or dropped by destroyed ships. Fly in any direction, turn around to chase an opponent, and evade pursuit in a true three-dimensional arena. Hostiles no longer disappear behind the camera or clear a wave merely by passing you. Your best score is saved in browser local storage when a mission ends (when storage is available).

### Controls

| Input | Action |
| --- | --- |
| Mouse / WASD / arrow keys | Yaw and pitch; forward thrust follows the nose |
| Scroll wheel / Q / E | Roll around the ship’s forward axis |
| Hold left mouse / Space | Fire primary weapons |
| Hold Shift | Boost while energy is available |
| M | Toggle mouse capture; during menus enables it for next launch |
| P / Escape | Pause / resume |
| Enter / launch button | Launch from the hangar |
| SOUND | Toggle synthesized audio |
| FX | Toggle high / performance rendering |
| BOUNDS | Toggle collision-sphere visualization (off by default) |

On touchscreens, drag on the space view to steer and fire. Keyboard and mouse on desktop are recommended. Opening another tab pauses the mission.

### Game settings

Open **SETTINGS** to select Relaxed, Standard, or Veteran difficulty. **Physical collisions** toggles impacts with spacecraft, asteroids, planets, and carriers. **Player damage** independently toggles incoming hull/shield damage; your weapons, power-up collection, and recovery remain active. **Capture mouse** locks and hides the cursor for relative mouse steering after Launch/Resume; Escape releases capture and pauses. Use **M** to toggle capture during flight. The **Capture Sensitivity** slider adjusts captured steering from **0.25× to 3×**, default **1×**, without altering unlocked mouse or keyboard steering. The HUD indicates the actual capture state and current sensitivity. Browsers may deny pointer lock; normal steering remains available.

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
- **Turrets:** eight batteries fire aimed, partially lead-corrected volleys within 320 km. They fire faster once shields drop (×1.25) and again when the hull is critical (×1.6). Larger ships get a wider boss-fire spread so hitbox size does not dominate survivability.
- **Phases:** `SHIELDED → SHIELDS DOWN → CRITICAL → DESTROYED`. Each change raises a HUD banner and a stinger; a low drone intensifies with the phase. The boss card shows shield/hull bars and four subsystem chips; the radar marks the carrier (pink square) and live subsystems (pink dots). Destroyed subsystems drop shield and hull pickups.
- **Visuals:** twin-barrel turrets track you and charge/flash when firing; a translucent shield bubble fades with remaining shield; destroyed systems burn and smoke, and the hull vents fire below 50%.

**Balance:** all numbers live in `BOSS_TUNING` and `BOSS_DIFFICULTY` in `src/capital.ts` and are covered by `src/capital.test.ts`. They were tuned with headless autopilot runs (orbiting at 110 km, ~35–40% shot accuracy, damage on, escorts removed) at several weave amplitudes. In those runs **Relaxed** forgives a nearly steady orbit, **Standard** needs a moderate weave (roughly 50–100% win rate for a moderate weaver on fighter, interceptor and bomber, with heavier ships safer) and **Veteran** needs aggressive evasive flying. Typical fights last 30–60 s of sustained fire; expect longer when you manoeuvre. The simulations omit the wave 5 escorts, so real fights are harder than those numbers suggest.

### Collision mechanics

Asteroid and spacecraft impacts use relative velocity, mass, and armor to determine damage. Shields absorb incoming damage before the hull; a quiet interval allows shield regeneration, but hull damage is permanent. Impact separation and contact cooldowns prevent a single overlap from applying damage every frame. Boosting into an asteroid is especially dangerous for a lightly armored interceptor.

## Architecture

- `src/main.ts` — hangar, flight manual, HUD, pause/results, high-score persistence.
- `src/style.css` — Tailwind import and cinematic responsive interface styling.
- `src/game.ts` — render loop, free-flight scene, chase camera, enemy pursuit, input, combat, waves, lifecycle.
- `src/flight.ts` — pure 3D flight and collision mathematics.
- `src/flight.test.ts` — flight orientation, pursuit, and collision regression tests.
- `src/models.ts` — original procedural spacecraft and environmental models.
- `src/rules.ts` — ship profiles and pure combat/collision rules.
- `src/capital.ts` — Leviathan boss subsystems, turrets, phases, and balance tuning.
- `src/capital.test.ts` — boss mechanics and tuning regression tests.
- `src/audio.ts` — locally synthesized combat audio.
- `src/rules.test.ts` — gameplay-rule regression tests.

Shields have no visible bubble by default: impact flashes overlay spacecraft surfaces. The BOUNDS setting enables optional collision-sphere visualization without changing physics. The background ocean planet uses procedural continents, cloud cover, a day/night terminator, and a thin atmospheric rim.

WebGL and hardware acceleration are required. If graphics initialization fails, the launcher displays an actionable fallback. Lower FX on slower devices. The game uses arcade-style 3D free flight with continuous forward thrust and a chase camera, not physically accurate orbital mechanics.

## Asset provenance

This is an original space-opera universe, not an official or licensed Star Wars game. The copyrighted preview images and ripped models originally suggested were not downloaded or used. No third-party branded ship designs, characters, storylines, music, or logos are included.
