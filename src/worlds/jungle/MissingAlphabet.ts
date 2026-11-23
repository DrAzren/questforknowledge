import * as THREE from 'three';
import { missingLetterQuestion, type SequenceQuestion } from '../../edu/questions';
import { boxCollider, type Collider } from '../../engine/Physics';
import {
  labelDecal, labelSprite, makeGoalArch, makeSign, makeWater, mat, rng, shadow,
} from '../../env/builders';
import { JungleStage } from './JungleStage';

interface LetterOption {
  letter: string;
  sprite: THREE.Sprite;
  x: number;
  z: number;
  top: number;
  state: 'idle' | 'wrong' | 'flying' | 'gone';
  timer: number;
  from: THREE.Vector3;
}

interface Round {
  question: SequenceQuestion;
  options: LetterOption[];
  planks: { mesh: THREE.Mesh; label: THREE.Mesh; mat: THREE.MeshStandardMaterial; pop: number }[];
  bridge: Collider;
  solved: boolean;
  /** Seconds since solved, drives the plank pop-in. */
  solvedTime: number;
  segMinZ: number;
  segMaxZ: number;
  gapMaxZ: number;
}

const WATER_Y = -0.95;
const PLANK_D = 1.2;
const TILE_COLORS = ['#ff6b6b', '#339af0', '#51cf66'];

/**
 * Stage 2 - Huruf Yang Hilang.
 * A broken rope bridge shows a run of letters with one missing (A B C ? E).
 * Affan hops onto the tree stump holding the right letter to rebuild it.
 */
export class MissingAlphabetStage extends JungleStage {
  private rounds: Round[] = [];
  private activeRound = -1;
  private goalZ = -62;

  build(): void {
    const rand = rng(2203);
    this.spawn.set(0, 0, 6);
    this.waterLevel = WATER_Y;

    // Stream running under the bridges.
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(60, 90), mat(0x1f6f8f, 1));
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(0, -2.6, -30);
    this.group.add(bed);
    const water = makeWater(60, 90);
    water.position.set(0, WATER_Y, -30);
    this.add(water);

    // Segments of land separated by 6 m gaps.
    const segs: [number, number][] = [[-6, 24], [-27, -12], [-48, -33], [-72, -54]];
    for (const [minZ, maxZ] of segs) {
      this.ground(-24, 24, minZ, maxZ, 0);
      this.wall(-8.4, -7, minZ, maxZ);
      this.wall(7, 8.4, minZ, maxZ);
    }
    this.wall(-8, 8, 8.6, 10);
    this.wall(-8, 8, -70, -68.5);

    const maxStarts = [0, 10, 21];
    for (let r = 0; r < 3; r++) {
      const [segMinZ, segMaxZ] = segs[r];
      this.buildRound(r, segMinZ, segMaxZ, missingLetterQuestion(this.game.rand, maxStarts[r]), rand);
    }

    // Obstacles: logs to hop over and a raised step.
    this.log(-15.2, 3.2);
    this.log(-36.2, 3.6);
    this.log(-39.4, 2.4);
    this.block(0, -58, 2.2, 1.0, 0.45, 0, 0x9c7b52);

    this.checkpoint(0, 0, 5, 3, false);
    this.checkpoint(0, 0, -13.6, 2.4, true, 3.4);
    this.checkpoint(0, 0, -34.6, 2.4, true, 3.4);
    this.checkpoint(0, 0, -55.6, 2.4, true, 3.4);

    const sign = makeSign('Huruf Yang Hilang', 4);
    sign.position.set(-4.6, 0, 3.2);
    sign.rotation.y = 0.35;
    this.decor.add(sign);

    this.coinLine(0, 3.5, 0, 0.5, 3);
    this.coinLine(-1.2, -13.5, 1.2, -18.5, 4);
    this.coin(0, 0.9, -15.2);
    this.coinLine(1.5, -34.5, -1.5, -40.5, 4);
    this.coin(0, 0.9, -36.2);
    this.coinLine(0, -55.3, 0, -56.6, 2, 0);
    this.coinLine(-1.4, -58, 1.4, -58, 3, 0.45);

    const arch = makeGoalArch();
    arch.position.set(0, 0, this.goalZ);
    this.add(arch);

    for (const [minZ, maxZ] of segs) {
      this.jungleBorders(rand, minZ + 0.8, maxZ - 0.8, 7.6, 20, { density: 1.1 });
      this.meadow(rand, -6.6, 6.6, minZ + 0.6, maxZ - 0.6, 0, 16, 40, (x) => Math.abs(x) < 1.4);
    }
    this.butterflies(6, -6, 6, -4, 8, rand);
    this.butterflies(5, -6, 6, -46, -34, rand);
    this.birdPost(5.6, -24.5, 0);
    this.birdPost(-5.8, -64, 0, 0xff8f3c);
    this.finishDecor();
  }

  private log(z: number, halfWidth: number): void {
    // A fallen log lying across the path: low enough to hop, too high to walk over.
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, halfWidth * 2, 12), mat(0x8a5a33, 0.9));
    m.rotation.z = Math.PI / 2;
    m.position.set(0, 0.26, z);
    shadow(m);
    this.group.add(m);
    for (const s of [-1, 1]) {
      const end = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12), mat(0xd9b382, 0.9));
      end.position.set(s * (halfWidth + 0.01), 0.26, z);
      end.rotation.y = s * (Math.PI / 2);
      this.group.add(end);
    }
    this.collide(boxCollider(0, z, halfWidth, 0.3, 0.55, 0));
  }

  private buildRound(r: number, segMinZ: number, segMaxZ: number, q: SequenceQuestion, rand: () => number): void {
    // Stumps holding the three letter choices.
    const stumpZ = segMinZ + 5.5;
    const xs = [-3.6, 0, 3.6];
    const tops = r === 0 ? [0.7, 0.7, 0.7] : r === 1 ? [0.7, 1.0, 0.7] : [1.0, 0.7, 1.1];
    const options: LetterOption[] = q.options.map((letter, i) => {
      const top = tops[i];
      const stump = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.08, top, 16), mat(0x8a5a33, 0.9));
      trunk.position.y = -top / 2;
      const cut = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.05, 16), mat(0xe2c08d, 0.9));
      cut.position.y = 0.01;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.36, 20), mat(0xb98d57, 0.9));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      stump.add(trunk, cut, ring);
      shadow(stump);
      this.pillar(xs[i], stumpZ, 0.95, top, 0, stump);
      // Steps up to the taller stumps so nobody gets stuck.
      if (top > 0.9) {
        this.block(xs[i], stumpZ + 1.5, 0.7, 0.55, 0.5, 0, 0x9c7b52);
      }
      const sprite = labelSprite(letter, { size: 1.15, bg: TILE_COLORS[i], color: '#ffffff', stroke: '#1d2a5c', padding: 46 });
      sprite.position.set(xs[i], top + 1.25, stumpZ);
      this.group.add(sprite);
      return { letter, sprite, x: xs[i], z: stumpZ, top, state: 'idle', timer: rand() * 6, from: new THREE.Vector3() };
    });

    // The bridge: five planks, ghostly until the missing letter is found.
    const gapMaxZ = segMinZ;
    const planks = q.sequence.map((letter, i) => {
      const m = new THREE.MeshStandardMaterial({ color: 0xc8935a, roughness: 0.85, transparent: true, opacity: 0.28 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.22, PLANK_D - 0.1), m);
      const z = gapMaxZ - PLANK_D / 2 - i * PLANK_D;
      mesh.position.set(0, -0.11, z);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      const label = labelDecal(i === q.missingIndex ? '?' : letter, { size: 0.8, color: i === q.missingIndex ? '#ffd43b' : '#fff7d6', stroke: '#4a2c12' });
      label.position.set(0, 0.012, z);
      this.group.add(label);
      return { mesh, label, mat: m, pop: 0 };
    });
    // Rope posts so the bridge reads clearly from the follow camera.
    for (const z of [gapMaxZ + 0.3, gapMaxZ - 6.3]) {
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 1.2, 8), mat(0x7a5230));
        post.position.set(s * 1.6, 0.6, z);
        this.decor.add(post);
      }
    }
    const bridge = this.collide(boxCollider(0, gapMaxZ - 3, 1.4, 3.05, 0, -0.22, 'bridge'));
    bridge.enabled = false;

    this.rounds.push({ question: q, options, planks, bridge, solved: false, solvedTime: 0, segMinZ, segMaxZ, gapMaxZ });
  }

  intro(): { duration: number; camera(t: number, out: { pos: THREE.Vector3; look: THREE.Vector3 }): void } {
    return {
      duration: 3.6,
      camera: (t, out) => {
        const k = Math.min(1, t / 3.6);
        const e = k * k * (3 - 2 * k);
        // Show the broken bridge first, then settle behind Affan.
        out.pos.set(5 - 5 * e, 4 + 1.4 * e, -2 + 16.6 * e);
        out.look.set(0, 0.6 + 0.7 * e, -9 + 13 * e);
      },
    };
  }

  protected tick(dt: number): void {
    const b = this.game.body;

    let active = -1;
    this.rounds.forEach((round, i) => {
      if (!round.solved && b.z <= round.segMaxZ + 0.5 && b.z >= round.segMinZ - 0.5) active = i;
    });
    if (active !== this.activeRound) {
      this.activeRound = active;
      if (active >= 0) {
        const q = this.rounds[active].question;
        this.game.showQuestion(q.prompt, q.detail);
      } else {
        this.game.hideQuestion();
      }
    }

    for (const round of this.rounds) {
      for (const o of round.options) {
        o.timer += dt;
        const baseY = o.top + 1.25;
        if (o.state === 'idle') {
          o.sprite.position.y = baseY + Math.sin(o.timer * 2.2) * 0.1;
          const onStump = b.grounded && Math.hypot(b.x - o.x, b.z - o.z) < 0.98 && Math.abs(b.y - o.top) < 0.05;
          if (onStump && !round.solved && !this.game.busy) {
            if (o.letter === round.question.answer) {
              o.state = 'flying';
              o.timer = 0;
              o.from.copy(o.sprite.position);
              round.solved = true;
              round.solvedTime = 0;
              round.bridge.enabled = true;
              this.game.praise(new THREE.Vector3(o.x, o.top + 1.4, o.z));
              this.game.addStar(new THREE.Vector3(o.x, o.top + 1.6, o.z));
              this.game.hideQuestion();
              this.activeRound = -1;
              // Swap the "?" for the found letter.
              const p = round.planks[round.question.missingIndex];
              const fresh = labelDecal(o.letter, { size: 0.8, color: '#8ce99a', stroke: '#1b4d2b' });
              fresh.position.copy(p.label.position);
              p.label.removeFromParent();
              p.label = fresh;
              this.group.add(fresh);
            } else {
              o.state = 'wrong';
              o.timer = 0;
              this.game.audio.sfx('wrong');
              this.game.encourage();
              this.game.affan.play('think', 1.2);
            }
          }
        } else if (o.state === 'wrong') {
          // Shake "no", then fade so the remaining choices stand out.
          o.sprite.position.x = o.x + Math.sin(o.timer * 30) * 0.12 * Math.max(0, 1 - o.timer * 1.4);
          o.sprite.material.opacity = Math.max(0.22, 1 - o.timer * 1.3);
          if (o.timer > 0.8) {
            o.sprite.position.x = o.x;
            o.state = 'gone';
          }
        } else if (o.state === 'flying') {
          // The letter flies to its place on the bridge.
          const k = Math.min(1, o.timer / 0.8);
          const e = k * k * (3 - 2 * k);
          const p = round.planks[round.question.missingIndex].mesh.position;
          o.sprite.position.set(
            o.from.x + (p.x - o.from.x) * e,
            o.from.y + (0.6 - o.from.y) * e + Math.sin(k * Math.PI) * 1.6,
            o.from.z + (p.z - o.from.z) * e,
          );
          o.sprite.material.opacity = 1 - Math.max(0, k - 0.7) / 0.3;
          if (k >= 1) {
            o.state = 'gone';
            o.sprite.visible = false;
          }
        }
      }
      if (round.solved && round.solvedTime < 3) {
        round.solvedTime += dt;
        round.planks.forEach((p, i) => {
          const k = Math.max(0, Math.min(1, (round.solvedTime - 0.3 - i * 0.14) / 0.3));
          if (k > 0 && p.pop === 0) {
            p.pop = 1;
            this.game.audio.sfx('coin', { volume: 0.5, rate: 0.8 + i * 0.1, minGap: 0 });
          }
          p.mat.opacity = 0.28 + 0.72 * k;
          if (k >= 1) p.mat.transparent = false;
          p.mesh.position.y = -0.11 + Math.sin(k * Math.PI) * 0.25;
        });
      }
    }

    if (b.z < this.goalZ + 0.6 && b.grounded && !this.game.busy) {
      this.finished = true;
      this.game.hideQuestion();
      this.game.completeStage();
    }
  }
}
