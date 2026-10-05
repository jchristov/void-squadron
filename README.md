# VOID SQUADRON

An original cinematic browser-based 3D space shooter. Built with TypeScript, Three.js, and Tailwind CSS. All spacecraft, planets, nebulae, asteroids, visual effects, and audio are generated locally — no ripped game assets, external fonts, or asset services.

## Run locally

Requires Node.js 22.18+ and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. For a production build:

```sh
npm run build
npm run preview
```

Run the pure gameplay-rule tests with `npm test`.

## Mission

Choose a spacecraft in the hangar, then launch Operation Shattered Orbit. Survive five increasingly difficult waves to break the blockade; shooting down enemies earns points, while evading ships that pass through the corridor also clears them from the current wave. Your best score is saved in browser local storage when a mission ends (when storage is available).

### Controls

| Input | Action |
| --- | --- |
| Mouse / WASD / arrow keys | Steer within the flight corridor |
| Hold left mouse / Space | Fire primary weapons |
| Hold Shift | Boost while energy is available |
| P / Escape | Pause / resume |
| Enter / launch button | Launch from the hangar |
| SOUND | Toggle synthesized audio |
| FX | Toggle high / performance rendering |

On touchscreens, drag on the space view to steer and fire. Keyboard and mouse on desktop are recommended. Opening another tab pauses the mission.

### Spacecraft

Six original classes are selectable: **fighter, interceptor, bomber, shuttle, freighter, and destroyer**. Each has different hull, shield, armor, mass, speed, fire rate, and weapon damage. Their combat profiles live in `src/rules.ts`.

### Collision mechanics

Asteroid and spacecraft impacts use relative velocity, mass, and armor to determine damage. Shields absorb incoming damage before the hull; a quiet interval allows shield regeneration, but hull damage is permanent. Impact separation and contact cooldowns prevent a single overlap from applying damage every frame. Boosting into an asteroid is especially dangerous for a lightly armored interceptor.

## Architecture

- `src/main.ts` — hangar, flight manual, HUD, pause/results, high-score persistence.
- `src/style.css` — Tailwind import and cinematic responsive interface styling.
- `src/game.ts` — render loop, scene, input, combat, waves, lifecycle.
- `src/models.ts` — original procedural spacecraft and environmental models.
- `src/rules.ts` — ship profiles and pure combat/collision rules.
- `src/audio.ts` — locally synthesized combat audio.
- `src/rules.test.ts` — gameplay-rule regression tests.

WebGL and hardware acceleration are required. If graphics initialization fails, the launcher displays an actionable fallback. Lower FX on slower devices. The game is a forward-flight arcade shooter, not an unrestricted orbital flight simulator.

## Asset provenance

This is an original space-opera universe, not an official or licensed Star Wars game. The copyrighted preview images and ripped models originally suggested were not downloaded or used. No third-party branded ship designs, characters, storylines, music, or logos are included.
