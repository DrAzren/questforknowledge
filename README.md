# The Curious Affan: Quest for Knowledge

*Belajar, Teroka, Lompat dan Temui!*

A 3D educational adventure game for children aged 4–6, in simple Bahasa Melayu.
Affan runs, jumps and explores, and every obstacle is a small lesson: numbers,
letters, colours, shapes and counting.

It runs in a desktop or mobile browser. Nothing to install for players.

## Status

| World | Stages | State |
|---|---|---|
| 1. Hutan Misteri (Jungle) | Sungai Nombor · Huruf Yang Hilang · Harta Karun Hutan | Playable |
| 2. Gurun Penemuan (Desert) | Shapes · Colours · Counting | Designed, not built |
| 3. Sekolah Ajaib (School) | Upper/lower case · Word builder · Animals | Designed, not built |
| 4. Cabaran Gunung Berapi (Volcano) | Addition · Subtraction · Sequences | Designed, not built |
| 5. Kerajaan Beku (Snow) | Mixed challenges · Snow Guardian finale | Designed, not built |

Worlds 2–5 appear on the world map as locked or "Akan datang!" and unlock in
order. Affan is currently a hand-built placeholder model matched to the
reference; a generated, rigged model replaces it once the turnaround is approved.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Build a static copy (the `dist` folder can be hosted anywhere):

```bash
npm run build
```

## Controls

| | Move | Jump | Run | Pause | Answer buttons |
|---|---|---|---|---|---|
| Keyboard | W A S D or arrows | Space | Shift | Esc or P | 1 2 3 |
| Touch | Joystick | ⬆ button | 🏃 toggle | ⏸ | Tap |

## How it is built

- **Three.js + TypeScript + Vite.** One engine runs every world.
- `src/engine` — game loop and rules (`Game.ts`), character physics
  (`Physics.ts`), keyboard and touch input, audio, saved progress.
- `src/character/Affan.ts` — Affan's model, animations and facial expressions.
- `src/env/builders.ts` — reusable scenery and props (trees, water, crocodiles,
  stones, coins, chest and so on).
- `src/edu/questions.ts` — question generators with age 4–6 limits.
- `src/worlds` — each world is a list of stages; a stage builds its scenery and
  puzzle on top of `Stage.ts`. Adding a world means adding its stages to
  `src/worlds/index.ts`.
- `src/ui/Hud.ts` — menus, HUD, question panel and quiz buttons.

Design rules the code follows: wrong answers are never punished harshly (a
gentle warning, a kind word, a second chance with fewer choices); running out
of hearts restarts the stage with full hearts instead of a "game over".

## Tests

```bash
npm test
```

Unit tests cover the physics (jump reach, gaps, walls, steps, moving platforms)
and every question generator.

```bash
npm run build && npx vite preview --port 4173
```

```bash
npm run test:e2e
```

The end-to-end run plays all three jungle stages through the real input layer
in a headless browser (wrong answers, falls, checkpoints, rewards, the quiz,
saving, unlocking) and then checks touch controls, audio playback and render
cost on a phone-sized screen. Screenshots land in `tests/e2e/output`.

## Audio

Music and sound effects were generated for this project with Higgsfield
(ElevenLabs Music and Mirelo SFX); Affan's voice lines with ElevenLabs
(library voice "Hafiz – Energetic Cartoon Character"). The button click is
synthesised in the browser. Any missing sound falls back to a synthesised one.
