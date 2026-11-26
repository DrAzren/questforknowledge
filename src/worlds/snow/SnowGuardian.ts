import * as THREE from 'three';
import { missingLetterQuestion, shuffle, spokenAdditionQuestion } from '../../edu/questions';
import { makeSign, rng, shadow } from '../../env/builders';
import { CARPET_COLORS, FLAT_SHAPES } from '../../env/desert';
import { makeAurora, makeIceCrystals, makeIgloo, makePolarBear, makeSnowGuardian, makeSnowman } from '../../env/snow';
import { ANIMALS } from '../school/AnimalMatch';
import { MAGIC_THEME, PAD_H, SnowStage, textOptions, type AnswerPad, type SnowQuestion } from './SnowStage';

type Phase = 'approach' | 'greet' | 'ask' | 'between' | 'unlock' | 'finale' | 'done';

/** How long the Guardian's welcome takes to say before the first question. */
const GREET_TIME = 7.8;
const PAD_Z = -30;
const PATH_CAM = new THREE.Vector3(0, 4.1, 6.3);
/** In the arena the camera pulls back and up so the Guardian stays in view beside the questions. */
const ARENA_CAM = new THREE.Vector3(0, 5.0, 8.8);
/** The Guardian is a giant: the model is built 5.6 units tall and stands this much bigger. */
const GIANT = 1.06;
const SPEAKER = '❄️ Penjaga Salji';
export const FINAL_LINE = { text: 'Yeay! Kita berjaya! Belajar sambil bermain memang menyeronokkan!', voice: 'final_berjaya' };

/**
 * World 5, stage 3 - Penjaga Salji.
 * The friendly Snow Guardian holds the Frozen Crystal. He asks five questions,
 * one of each kind met on the journey: a letter, a sum, a colour, a shape and
 * an animal. Every right answer lights a shard around the crystal; the fifth
 * frees it, and the whole kingdom turns magical.
 */
export class SnowGuardianStage extends SnowStage {
  phase: Phase = 'approach';
  /** Index of the question being asked. */
  current = 0;
  questions: SnowQuestion[] = [];
  answerPads: AnswerPad[] = [];
  guardian = makeSnowGuardian();
  /** 0 = ordinary snowy day, 1 = the kingdom fully magical. */
  magic = 0;
  private aurora = makeAurora();
  private timer = 0;
  private cheerTime = 0;
  private sparkleTimer = 0;
  private aspect = -1;

  build(): void {
    const rand = rng(15303);
    const g = this.game.rand;
    this.spawn.set(0, 0, 8);

    this.snow(-8, 24);
    this.icyWater(-16.4, -8, rand);
    this.snow(-74, -16.4);
    this.wall(-8, 8, 11.6, 13);
    this.wall(-8, 8, -36, -34.6, 30, -6);
    this.floe(2.8, (t) => [Math.sin(t * 0.7) * 2.2, 0, -10.3]);
    this.floe(2.8, (t) => [Math.sin(t * 0.7 - 0.5) * 2.2, 0, -14.1]);
    this.checkpoint(0, 0, 7, 3, false);
    this.checkpoint(0, 0, -18.4, 1.9, true, 3.8);

    // The five questions: a letter, a sum, a colour, a shape, an animal.
    const letter = missingLetterQuestion(g, 14);
    const sum = spokenAdditionQuestion(g, 1);
    const colours = shuffle(g, Object.keys(CARPET_COLORS)).slice(0, 3);
    const colour = colours[0];
    const shapes = shuffle(g, FLAT_SHAPES).slice(0, 3);
    const shape = shapes[0];
    const tints = shuffle(g, Object.values(CARPET_COLORS));
    const animals = shuffle(g, ANIMALS).slice(0, 3);
    const animal = animals[0];
    this.questions = [
      { prompt: letter.prompt, detail: letter.detail, voice: letter.voice, answer: letter.answer, options: textOptions(letter.options) },
      { prompt: sum.prompt, detail: sum.detail, voice: sum.voice, answer: sum.answer, options: textOptions(sum.options) },
      {
        prompt: `Cari warna ${colour.toUpperCase()}`, voice: `q_warna_${colour}`, answer: colour,
        options: shuffle(g, colours).map((c) => ({ value: c, face: { kind: 'colour', hex: CARPET_COLORS[c] } })),
      },
      {
        prompt: `Lompat dan pijak bentuk ${shape.toUpperCase()}`, voice: `q_pijak_${shape.replace(/ /g, '_')}`, answer: shape,
        options: shuffle(g, shapes).map((s, i) => ({ value: s, face: { kind: 'shape', shape: s, hex: tints[i] } })),
      },
      {
        prompt: `Cari ${animal.id.toUpperCase()}`, voice: `q_cari_${animal.id}`, answer: animal.id,
        options: shuffle(g, animals).map((a) => ({ value: a.id, face: { kind: 'emoji', emoji: a.emoji } })),
      },
    ];

    // The answer blocks wait flat in the snow until the Guardian asks.
    // (Set a little closer together than on the path, so Affan and the Guardian both stay in view.)
    this.answerPads = this.pads([0, 1, 2].map(() => ({ value: '', face: { kind: 'emoji', emoji: '❄️' } })), PAD_Z, 0, [-3.1, 0, 3.1]);
    for (const p of this.answerPads) this.setPadTop(p, 0.12);

    this.guardian.scale.setScalar(GIANT);
    this.add(this.guardian);
    this.add(this.aurora);
    this.placeGuardian();

    const sign = makeSign('Penjaga Salji', 3.6);
    sign.position.set(-5, 0, 6.6);
    sign.rotation.y = 0.35;
    this.veil(shadow(sign), true);
    this.coinLine(0, 5.6, 0, 2.6, 3);
    this.coin(0, 0, -10.3);
    this.coin(0, 0, -14.1);
    this.coinLine(-3, -21, 3, -21, 4);

    // A ring of crystals closes the back of the arena; friends gather on the right to watch.
    for (let i = 0; i < 7; i++) {
      const c = makeIceCrystals(rand, this.crystalMats[i % 3], 1.5 + rand() * 0.8, 5);
      c.position.set(-3.2 + i * 1.6, 0, -35.7 + Math.sin(i * 1.3) * 0.3);
      this.decor.add(c);
    }
    [[8.5, -23.6], [9.5, -25.8], [8.6, -28.0], [9.6, -30.2], [8.7, -32.4]].forEach(([x, z]) => this.penguin(x, 0, z, -1.15));
    const bear = makePolarBear();
    bear.position.set(11.6, 0, -27);
    bear.rotation.y = -1.2;
    this.decor.add(bear);
    const man = makeSnowman(rand);
    man.position.set(-8.6, 0, -19.5);
    man.rotation.y = 0.9;
    this.decor.add(man);
    const igloo = makeIgloo(2.2);
    igloo.position.set(13.5, 0, -40);
    igloo.rotation.y = -0.8;
    this.decor.add(igloo);

    this.snowBorders(rand, -14, 22);
    this.snowBorders(rand, -48, -14, 0, [-1], 12);
    this.snowBorders(rand, -48, -14, 0, [1], 5);
    this.snowBorders(rand, -72, -48, 0, [-1, 1], -6);
    this.skyline(-112);
    this.startSnow();
    this.finishDecor();
  }

  private setPadTop(p: AnswerPad, height: number): void {
    this.game.physics.moveTo(p.collider, p.x, p.base + height, p.z);
    p.mesh.position.y = p.base + height;
  }

  /** Lower every block toward the snow (between questions). */
  private lowerPads(dt: number): void {
    for (const p of this.answerPads) {
      const h = Math.max(0.12, p.collider.top - p.base - 1.4 * dt);
      this.setPadTop(p, h);
    }
  }

  /**
   * On a wide screen the Guardian stands at the left of the arena, clear of the
   * question panel; on a tall phone screen there is no room at the side, so he
   * stands at the back, where a tall screen shows him whole.
   */
  private placeGuardian(): void {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    if (aspect === this.aspect) return;
    this.aspect = aspect;
    if (aspect < 1) {
      this.guardian.position.set(0, 0, -42);
      this.guardian.rotation.y = 0;
    } else {
      // The wider the screen, the wider the question panel is on it, so the further out he stands.
      const halfView = 0.4877 * aspect * 16.5;
      const k = Math.max(0.58, Math.min(0.76, 0.64 + (aspect - 1.78) * 0.2));
      const x = -Math.max(8.3, k * halfView);
      this.guardian.position.set(x, 0, -38.5);
      this.guardian.rotation.y = Math.atan2(-x, 10.5);
    }
    // The northern lights hang in the sky behind him.
    const yaw = this.guardian.rotation.y;
    this.aurora.position.set(this.guardian.position.x - Math.sin(yaw) * 62, 0, this.guardian.position.z - Math.cos(yaw) * 62);
    this.aurora.rotation.y = yaw;
  }

  private ask(index: number): void {
    this.current = index;
    this.phase = 'ask';
    const q = this.questions[index];
    // If Affan is still standing on a block, the next answer goes on one of the others, so he always has to hop to choose.
    const b = this.game.body;
    const under = this.answerPads.findIndex((p) => b.grounded && b.ground === p.collider);
    if (under >= 0 && q.options[under].value === q.answer) {
      const other = (under + 1 + Math.floor(this.game.rand() * 2)) % 3;
      [q.options[under], q.options[other]] = [q.options[other], q.options[under]];
    }
    this.resetPads(this.answerPads, q.options);
    this.game.showQuestion(q.prompt, q.detail, q.voice);
  }

  private startFinale(): void {
    this.phase = 'finale';
    this.timer = 0;
    this.guardian.userData.setMood('cheer');
    this.game.audio.sfx('crystal_magic');
    void this.game.audio.music(MAGIC_THEME.music);
    for (const p of this.penguins) p.userData.mode = 'cheer';

    const G = this.guardian.position.clone();
    const yaw = this.guardian.rotation.y;
    const f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const r = new THREE.Vector3(f.z, 0, -f.x);
    const b = this.game.body;
    const affan = new THREE.Vector3(b.x, b.y, b.z);
    const pos1 = new THREE.Vector3();
    const look1 = new THREE.Vector3();
    const shot1 = (e: number): void => {
      // Low and close, looking up as he lifts the crystal into the sky.
      pos1.copy(G).addScaledVector(f, (14 - 3 * e) * GIANT).addScaledVector(r, 2.6 - 4.6 * e).setY(1.5 + 0.7 * e);
      look1.copy(G).addScaledVector(f, 0.7).setY((4.2 + 1.5 * e) * GIANT);
    };
    const pos2 = affan.clone().addScaledVector(f, 4.8).addScaledVector(r, 1.4).setY(affan.y + 1.6);
    const look2 = affan.clone().setY(affan.y + 1.25);
    this.game.cutscene(8.6, (t, out) => {
      const e1 = Math.min(1, t / 5.2);
      shot1(e1 * e1 * (3 - 2 * e1));
      if (t <= 5.2) {
        out.pos.copy(pos1);
        out.look.copy(look1);
      } else {
        const k = Math.min(1, (t - 5.2) / 2.2);
        const e = k * k * (3 - 2 * k);
        out.pos.copy(pos1).lerp(pos2, e);
        out.look.copy(look1).lerp(look2, e);
      }
    }, () => {
      this.phase = 'done';
      this.finished = true;
      this.game.hideQuestion();
      this.game.completeStage({ line: FINAL_LINE, delay: 6.6 });
    });
    this.game.caption(SPEAKER, 'Hebat, Affan! Kristal Beku kini bersinar!', { voice: 'g_hebat', duration: 5 });
  }

  intro(): { duration: number; camera(t: number, out: { pos: THREE.Vector3; look: THREE.Vector3 }): void } {
    const G = this.guardian.position;
    return {
      duration: 5.4,
      camera: (t, out) => {
        const k = Math.min(1, t / 5.4);
        const e = k * k * (3 - 2 * k);
        // Open on the Guardian and his crystal, then fly back to Affan.
        out.pos.set((G.x + 6) * (1 - e), 3.2 + 0.9 * e, -22 + 36.3 * e);
        out.look.set(G.x * (1 - e), 3.8 - 2.7 * e, G.z + (6.4 - G.z) * e);
      },
    };
  }

  protected tick(dt: number): void {
    this.tickSnow(dt);
    const b = this.game.body;
    this.placeGuardian();
    this.guardian.userData.lookAt(b.x, b.z);
    this.cameraOffset.lerp(b.z < -19.2 ? ARENA_CAM : PATH_CAM, 1 - Math.exp(-dt * 2));

    if (this.cheerTime > 0) {
      this.cheerTime -= dt;
      if (this.cheerTime <= 0 && this.phase !== 'finale') for (const p of this.penguins) p.userData.mode = 'stand';
    }
    this.timer += dt;

    if (this.phase === 'approach') {
      if (b.z < -19.6 && b.grounded && !this.game.busy) {
        this.phase = 'greet';
        this.timer = 0;
        this.guardian.userData.setMood('happy');
        this.game.audio.sfx('guardian');
        this.game.caption(SPEAKER, 'Selamat datang, Affan! Jawab lima soalan untuk membuka Kristal Beku.', { voice: 'g_selamat', duration: GREET_TIME });
      }
    } else if (this.phase === 'greet') {
      if (this.timer > GREET_TIME) this.ask(0);
    } else if (this.phase === 'ask') {
      const q = this.questions[this.current];
      const hit = this.tickPads(this.answerPads, q.answer, true, dt);
      if (hit?.result === 'right') {
        const lit = this.guardian.userData.lit + 1;
        this.guardian.userData.setLit(lit);
        this.guardian.userData.setMood('happy');
        this.game.praise(new THREE.Vector3(hit.pad.x, 1.8, hit.pad.z));
        this.game.addStar(new THREE.Vector3(hit.pad.x, 2.1, hit.pad.z));
        this.game.audio.sfx('crystal_chime');
        this.game.audio.sfx('guardian', { volume: 0.7 });
        this.game.sparkles.burst(this.guardian.userData.crystalPosition(new THREE.Vector3()), 30, [0xffffff, 0x9be7ff, 0xffe066], 4.5);
        for (const p of this.penguins) p.userData.mode = 'cheer';
        this.cheerTime = 1.8;
        this.timer = 0;
        this.phase = lit >= this.questions.length ? 'unlock' : 'between';
      } else if (hit?.result === 'wrong') {
        this.guardian.userData.setMood('think');
        this.game.audio.sfx('wrong');
        this.game.encourage();
        this.game.affan.play('think', 1.1);
      }
    } else if (this.phase === 'between') {
      if (this.timer > 1.0) this.lowerPads(dt);
      if (this.timer > 2.3) this.ask(this.current + 1);
    } else if (this.phase === 'unlock') {
      if (this.timer > 0.9) this.lowerPads(dt);
      if (this.timer > 1.7 && !this.game.busy) this.startFinale();
    } else if (this.phase === 'finale') {
      const k = Math.max(0, Math.min(1, (this.timer - 0.9) / 3.2));
      this.magic = k * k * (3 - 2 * k);
      this.game.mood(MAGIC_THEME, this.magic);
      this.aurora.userData.setStrength(this.magic);
      this.glow(this.magic);
      this.sparkleTimer -= dt;
      if (this.sparkleTimer <= 0) {
        this.sparkleTimer = 0.22;
        const c = this.guardian.userData.crystalPosition(new THREE.Vector3());
        this.game.sparkles.burst(c, 16, [0xffffff, 0x9be7ff, 0xffe066, 0xd0bfff], 6);
        const r = this.game.rand;
        // More sparkles drifting around him (kept well away from the camera, where they would look huge).
        this.game.sparkles.burst(c.clone().add(new THREE.Vector3((r() - 0.5) * 9, (r() - 0.7) * 6, (r() - 0.5) * 5)), 10, [0xffffff, 0xb2f2bb, 0xd0bfff, 0xffc9c9], 3);
      }
      if (this.timer > 5.4 && this.timer - dt <= 5.4) this.game.affan.play('celebrate', 3);
    }
  }
}

export { PAD_H };
