import * as THREE from 'three';
import { numberSequenceQuestion, penguinCountQuestion, spokenSubtractionQuestion } from '../../edu/questions';
import { boxCollider, discCollider } from '../../engine/Physics';
import { makeGoalArch, makeSign, mat, rng, shadow } from '../../env/builders';
import { ICE, makeAnswerPad, makeIceCrystals, makeIgloo, makePenguin, makePolarBear, type AnswerPadMesh } from '../../env/snow';
import { SnowStage, textOptions, type SnowRound } from './SnowStage';

type Penguin = ReturnType<typeof makePenguin>;

interface Leaver {
  penguin: Penguin;
  dir: number;
  gone: boolean;
}

const SHELF_H = 0.45;
/** The shelf stands this far in front of the answer blocks: far enough that the penguins never hide an answer. */
const SHELF_AHEAD = 5.6;

/**
 * World 5, stage 2 - Tasik Penguin.
 * Maths with penguins: count the penguins on the ice shelf, then a
 * subtraction where some of them really do slide away, then a missing number
 * on a row of little ice blocks.
 */
export class PenguinLakeStage extends SnowStage {
  private goalZ = -77;
  /** The penguins to count in round 1. */
  counted: Penguin[] = [];
  /** The penguins of the subtraction: all of them, and the ones that leave. */
  flock: Penguin[] = [];
  leavers: Leaver[] = [];
  private leaveTimer = 0;
  private blocks: AnswerPadMesh[] = [];

  build(): void {
    const rand = rng(15202);
    const g = this.game.rand;
    this.spawn.set(0, 0, 8.6);

    this.snow(-6, 24);
    this.icyWater(-12, -6, rand);
    this.snow(-30, -12);
    this.icyWater(-36, -30, rand);
    this.snow(-40.6, -36);
    this.icyWater(-49, -40.6, rand);
    this.snow(-62, -49);
    this.icyWater(-68, -62, rand);
    this.snow(-90, -68);
    this.wall(-8, 8, 12.2, 13.6);
    this.wall(-8, 8, -86, -84.6);

    // Round 1: count the penguins.
    const q1 = penguinCountQuestion(g, 3, 8);
    this.counted = this.shelf(SHELF_AHEAD - 0.6, q1.answer);
    this.addRound({ prompt: q1.prompt, voice: q1.voice, answer: q1.answer, options: textOptions(q1.options) }, -0.6, [-12, -6], 10.5, {
      onSolved: () => this.counted.forEach((p) => { p.userData.mode = 'cheer'; }),
    });

    // Round 2: subtraction. The penguins being taken away belly-slide off the shelf.
    const q2 = spokenSubtractionQuestion(g, 1);
    const [a, b] = q2.parts;
    this.flock = this.shelf(SHELF_AHEAD - 24.6, a);
    this.leavers = this.flock.slice(a - b).map((penguin, i) => ({ penguin, dir: i % 2 ? -1 : 1, gone: false }));
    this.addRound({ prompt: q2.prompt, detail: q2.detail, voice: q2.voice, answer: q2.answer, options: textOptions(q2.options) }, -24.6, [-36, -30], -12, {
      whileShown: (round, dt) => this.tickLeavers(round, dt),
      onSolved: () => this.flock.forEach((p) => { if (p.visible && p.userData.mode === 'stand') p.userData.mode = 'cheer'; }),
    });

    // Round 3: the missing number, on a row of little ice blocks.
    const q3 = numberSequenceQuestion(g, 4, 12);
    q3.sequence.forEach((n, i) => {
      const block = makeAnswerPad(0.5, 0.5);
      block.userData.setFace({ kind: 'text', text: i === q3.missingIndex ? '?' : String(n) });
      const x = (i - 2) * 1.12;
      block.position.set(x, 0.5, -52);
      this.group.add(block);
      this.collide(discCollider(x, -52, 0.5, 0.5, 0, 'block'));
      this.blocks.push(block);
    });
    this.addRound({ prompt: q3.prompt, detail: q3.detail, voice: q3.voice, answer: q3.answer, options: textOptions(q3.options) }, -56.6, [-68, -62], -49, {
      onSolved: () => {
        const block = this.blocks[q3.missingIndex];
        block.userData.setFace({ kind: 'text', text: String(q3.answer) });
        block.userData.setState('right');
      },
    });

    this.snowball(-15.4);
    this.floe(2.8, (t) => [Math.sin(t * 0.7) * 2.2, 0, -42.9]);
    this.floe(2.8, (t) => [Math.sin(t * 0.7 - 0.5) * 2.2, 0, -46.7]);
    this.penguinSlider(-72.4, 6.5, 0);

    this.checkpoint(0, 0, 7.6, 3, false);
    this.checkpoint(0, 0, -13.4, 1.6, true, 3.4);
    this.checkpoint(0, 0, -38.2, 1.8, true, 3.4);
    this.checkpoint(0, 0, -50.2, 1.4, true, 3.4);
    this.checkpoint(0, 0, -69.6, 1.8, true, 3.4);

    const sign = makeSign('Tasik Penguin', 3.6);
    sign.position.set(-5, 0, 7.4);
    sign.rotation.y = 0.35;
    this.veil(shadow(sign), true);
    this.coinLine(4.6, 6, 4.6, 2, 3);
    this.coinLine(0, -7, 0, -11, 3);
    this.coinLine(-4.6, -17, -4.6, -21.4, 3);
    this.coinLine(0, -31, 0, -35, 3);
    this.coin(0, 0, -42.9);
    this.coin(0, 0, -46.7);
    this.coinLine(0, -63, 0, -67, 3);
    this.coinLine(0, -74, 0, -76, 2);

    const arch = makeGoalArch();
    arch.position.set(0, 0, this.goalZ);
    this.add(arch);

    const bear = makePolarBear();
    bear.position.set(9.8, 0, -44);
    bear.rotation.y = -1.0;
    this.decor.add(bear);
    const igloo = makeIgloo(2);
    igloo.position.set(-10.8, 0, 3);
    igloo.rotation.y = 0.9;
    this.decor.add(igloo);
    this.penguin(-8.8, 0, -58, 1.1);
    this.penguin(8.7, 0, -71, -1.0);
    const big = makeIceCrystals(rand, this.crystalMats[1], 3.2, 7);
    big.position.set(0, 0, -82.5);
    this.decor.add(big);

    this.snowBorders(rand, -88, 22);
    this.skyline(-125);
    this.startSnow();
    this.finishDecor();
  }

  /** A low shelf of ice across the middle of the path with `count` penguins standing on it, in rows of four. */
  private shelf(z: number, count: number): Penguin[] {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(5.0, SHELF_H, 2.4), mat(ICE, 0.25, { emissive: 0x4f9fdc, emissiveIntensity: 0.2 }));
    slab.position.set(0, SHELF_H / 2, z);
    slab.castShadow = true;
    slab.receiveShadow = true;
    const top = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.08, 2.5), mat(0xf4f9ff, 0.95));
    top.position.set(0, SHELF_H, z);
    top.receiveShadow = true;
    this.group.add(slab, top);
    this.collide(boxCollider(0, z, 2.5, 1.2, SHELF_H, 0, 'shelf'));
    const out: Penguin[] = [];
    const back = Math.min(4, Math.ceil(count / 2));
    const front = count - back;
    const place = (n: number, rowZ: number): void => {
      for (let i = 0; i < n; i++) {
        const p = this.penguin((i - (n - 1) / 2) * 1.12, SHELF_H + 0.04, rowZ);
        this.penguins.pop();
        out.push(p);
      }
    };
    // Counting reads left to right, back row first.
    place(count <= 4 ? count : back, count <= 4 ? z : z - 0.55);
    if (count > 4) place(front, z + 0.55);
    return out;
  }

  /** One by one, the penguins being subtracted slide off the shelf and away. */
  private tickLeavers(round: SnowRound, dt: number): void {
    if (round.shown > 1.6) {
      this.leaveTimer -= dt;
      const next = this.leavers.find((l) => l.penguin.userData.mode === 'stand');
      if (next && this.leaveTimer <= 0) {
        this.leaveTimer = 0.7;
        next.penguin.userData.mode = 'slide';
        next.penguin.rotation.y = (next.dir * Math.PI) / 2;
        this.game.audio.sfx('penguin', { volume: 0.5, minGap: 0.2 });
      }
    }
    for (const l of this.leavers) {
      const p = l.penguin;
      if (l.gone || p.userData.mode !== 'slide') continue;
      p.position.x += l.dir * 5.2 * dt;
      // Off the edge of the shelf and down onto the snow.
      if (Math.abs(p.position.x) > 2.6) p.position.y = Math.max(0, p.position.y - 3 * dt);
      if (Math.abs(p.position.x) > 12.5) {
        l.gone = true;
        p.visible = false;
        this.game.sparkles.burst(p.position.clone().setY(0.4), 12, [0xffffff, 0xdcefff], 2.5);
      }
    }
  }

  intro(): { duration: number; camera(t: number, out: { pos: THREE.Vector3; look: THREE.Vector3 }): void } {
    return {
      duration: 4.6,
      camera: (t, out) => {
        const k = Math.min(1, t / 4.6);
        const e = k * k * (3 - 2 * k);
        // Start close on the penguins to count, then rise behind Affan.
        out.pos.set(-3.4 + 3.4 * e, 1.7 + 2.4 * e, 8.2 + 6.7 * e);
        out.look.set(0, 1.0 + 0.1 * e, 5.0 + 2.0 * e);
      },
    };
  }

  protected tick(dt: number): void {
    this.tickSnow(dt);
    this.tickRounds(dt);
    const b = this.game.body;
    if (b.z < this.goalZ + 0.6 && b.grounded && !this.game.busy) {
      this.finished = true;
      this.game.hideQuestion();
      this.game.completeStage();
    }
  }
}
