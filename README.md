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
| 2. Gurun Penemuan (Desert) | Pintu Bentuk · Permaidani Warna · Kira di Gurun | Playable |
| 3. Sekolah Ajaib (School) | Huruf Besar dan Kecil · Bina Perkataan · Kenal Haiwan | Playable |
| 4. Cabaran Gunung Berapi (Volcano) | Jambatan Lava · Gua Kristal · Puncak Gunung | Playable |
| 5. Kerajaan Beku (Snow) | Mixed challenges · Snow Guardian finale | Designed, not built |

World 5 appears on the world map as locked or "Akan datang!" and unlocks in
order.

Every question is read aloud by a narrator when it appears, and the speaker
button on the question panel (or the R key) repeats it. Praise and
encouragement are spoken with the same words that appear on screen.

Affan is a generated, rigged model (`public/assets/models/affan.glb`, about
1.7 MB) with ten animation clips. A simple built-in body shows for the moment
before it loads, and stays if the file cannot be fetched.

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
| Keyboard | W A S D or arrows | Space | Shift | Esc or P | 1 2 3 (R repeats the question) |
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

The end-to-end run plays all twelve jungle, desert, school and volcano stages through
the real input layer in a headless browser (wrong answers, falls, checkpoints, rewards, the quiz,
saving, unlocking) and then checks touch controls, audio playback and render
cost on a phone-sized screen. Screenshots land in `tests/e2e/output`.

## Affan's model

The model and each animation clip were generated with Higgsfield (Meshy) from
the approved turnaround. Each clip arrives on its own slightly different
skeleton, so `tools/build-affan.mjs` retargets every clip onto the base
skeleton, removes root motion, shrinks the textures and compresses the mesh:

```bash
node tools/build-affan.mjs <folder with base.glb and one .glb per clip>
```

The 11 MB source files are not kept in the repository; they remain in the
Higgsfield account that generated them.

## Audio

Narration is recorded as long takes of many lines and cut into one clip per
line:

```bash
python3 tools/split_narration.py take.mp3 public/assets/audio/voice name1 name2
```

Music and sound effects were generated for this project with Higgsfield
(ElevenLabs Music and Mirelo SFX); Affan's voice lines with ElevenLabs,
using the project owner's own "Affan Clone" voice, and the narrator's
questions and feedback with the library voice "Zain – Gentle Kids Story
Narrator". The button click is
synthesised in the browser. Any missing sound falls back to a synthesised one.
