import * as THREE from 'three';
import { shuffle } from '../../edu/questions';
import { boxCollider, type Collider } from '../../engine/Physics';
import { labelDecal, labelSprite, makeGoalArch, makeSign, mat, rng, shadow } from '../../env/builders';
import { makeBookStack, makeEasel, SCHOOL_COLORS } from '../../env/school';
import { SchoolStage } from './SchoolStage';

/** Three-letter words with a picture and the narration that introduces them. */
export const WORDS: { word: string; emoji: string; malay: string; voice: string }[] = [
  { word: 'CAT', emoji: '🐱', malay: 'kucing', voice: 'q_eja_cat' },
  { word: 'DOG', emoji: '🐶', malay: 'anjing', voice: 'q_eja_dog' },
  { word: 'SUN', emoji: '☀️', malay: 'matahari', voice: 'q_eja_sun' },
  { word: 'BUS', emoji: '🚌', malay: 'bas', voice: 'q_eja_bus' },
];

interface Tile {
  letter: string;
  sprite: THREE.Sprite;
  collider: Collider;
  x: number;
  z: number;
  top: number;
  state: 'idle' | 'flying' | 'gone';
  timer: number;
  /** Re-armed when Affan steps off, so standing still does not repeat the feedback. */
  armed: boolean;
  shake: number;
  from: THREE.Vector3;
  slot: number;
}

interface Round {
  word: string;
  emoji: string;
  voice: string;
  found: number;
  tiles: Tile[];
  planks: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; label: THREE.Mesh; z: number }[];
  bridge: Collider;
  easel: ReturnType<typeof makeEasel>;
  solved: boolean;
  solvedTime: number;
  segMinZ: number;
  segMaxZ: number;
}

const STACK_X = [-4.6, -2.3, 0, 2.3, 4.6];
const STACK_DZ = [0, -1.3, -2.0, -1.3, 0];
const TILE_BG = ['#ff6b6b', '#339af0', '#51cf66', '#f59f00', '#be4bdb'];
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * World 3, stage 2 - Bina Perkataan.
 * In the library, a picture stands on an easel. Affan collects the letters of
 * its word in order from piles of books; the finished word becomes the bridge
 * across the ball pit.
 */
export class WordBuilderStage extends SchoolStage {
  private rounds: Round[] = [];
  private active = -1;
  private goalZ = -68;

  build(): void {
    const rand = rng(8205);
    const g = this.game.rand;
    this.spawn.set(0, 0, 8);

    const segs: [number, number][] = [[-6, 24], [-30, -12], [-54, -36], [-80, -60]];
    for (const [minZ, maxZ] of segs) this.floor(minZ, maxZ, 0xe9d8b4);
    for (const [minZ, maxZ] of [[-12, -6], [-36, -30], [-60, -54]]) this.ballPit(minZ, maxZ, rand);
    this.wall(-8, 8, 11.6, 13);
    this.wall(-8, 8, -76, -74.6);

    const words = shuffle(g, WORDS).slice(0, 3);
    const heights = [[0.6, 0.6, 0.6, 0.6, 0.6], [0.6, 0.9, 0.6, 0.9, 0.6], [0.9, 0.6, 1.1, 0.6, 0.9]];
    words.forEach((w, r) => this.buildRound(r, segs[r][0], segs[r][1], w, heights[r], rand, g));

    // Obstacles between the bridges and the next piles of books.
    this.spinner(0, -16, 2.0, 7, 1);
    this.block(0, -40, 4.2, 0.4, 0.5, 0, SCHOOL_COLORS[1]);
    for (const x of [-5.4, 5.4]) {
      const cap = makeBookStack(rand, 1.5, 2);
      cap.position.set(x, 1.5, -40);
      this.decor.add(cap);
      this.collide(boxCollider(x, -40, 1, 0.8, 1.5, 0));
    }

    this.checkpoint(0, 0, 7, 3, false);
    this.checkpoint(0, 0, -12.9, 1.7, true, 3.4);
    this.checkpoint(0, 0, -37.2, 2, true, 3.4);
    this.checkpoint(0, 0, -61.2, 2, true, 3.4);

    const sign = makeSign('Bina Perkataan', 3.8);
    sign.position.set(-5, 0, 6.6);
    sign.rotation.y = 0.35;
    this.decor.add(sign);
    this.coinLine(0, 5.6, 0, 4, 2);
    this.coinLine(-3.6, -14, 3.6, -19, 4);
    this.coinLine(-2, -37.6, 2, -38.6, 3);
    this.coinLine(-1.4, -40, 1.4, -40, 3, 0.5);
    this.coinLine(0, -62, 0, -66, 3);

    const arch = makeGoalArch();
    arch.position.set(0, 0, this.goalZ);
    this.add(arch);

    for (const [minZ, maxZ] of segs) this.schoolBorders(rand, minZ + 0.4, Math.min(maxZ, 22), 'library');
    this.schoolyard(-102);
    this.finishDecor();
  }

  private buildRound(
    r: number, segMinZ: number, segMaxZ: number, w: (typeof WORDS)[number],
    heights: number[], rand: () => number, g: () => number,
  ): void {
    const letters = w.word.split('');
    const spare = shuffle(g, ALPHABET.split('').filter((c) => !letters.includes(c))).slice(0, 2);
    const order = shuffle(g, [...letters, ...spare]);
    const z0 = segMinZ + 8.2;
    const tiles: Tile[] = order.map((letter, i) => {
      const top = heights[i];
      const x = STACK_X[i];
      const z = z0 + STACK_DZ[i];
      const stack = makeBookStack(rand, top, 1.9);
      stack.position.set(x, top, z);
      this.group.add(stack);
      const collider = this.collide(boxCollider(x, z, 0.9, 0.72, top, 0, 'stack'));
      if (top > 1.0) this.block(x, z + 1.5, 0.7, 0.5, 0.5, 0, SCHOOL_COLORS[3]);
      const sprite = labelSprite(letter, { size: 1.1, bg: TILE_BG[i], color: '#ffffff', stroke: '#1d2a5c', padding: 46 });
      sprite.position.set(x, top + 1.25, z);
      this.group.add(sprite);
      return { letter, sprite, collider, x, z, top, state: 'idle', timer: rand() * 6, armed: true, shake: 0, from: new THREE.Vector3(), slot: -1 };
    });

    // The bridge: one plank per letter, ghostly until the word is spelled.
    const planks = letters.map((_, i) => {
      const m = new THREE.MeshStandardMaterial({ color: 0xffd8a8, roughness: 0.8, transparent: true, opacity: 0.25 });
      const z = segMinZ - 1 - i * 2;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.22, 1.9), m);
      mesh.position.set(0, -0.11, z);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      const label = labelDecal('_', { size: 1.2, color: '#ffd43b', stroke: '#4a2c12' });
      label.position.set(0, 0.012, z);
      this.group.add(label);
      return { mesh, mat: m, label, z };
    });
    for (const z of [segMinZ + 0.3, segMinZ - 6.3]) {
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.2, 8), mat(SCHOOL_COLORS[(r + (s > 0 ? 1 : 0)) % 6], 0.6));
        post.position.set(s * 1.7, 0.6, z);
        this.decor.add(post);
      }
    }
    const bridge = this.collide(boxCollider(0, segMinZ - 3, 1.45, 3.05, 0, -0.22, 'bridge'));
    bridge.enabled = false;

    const easel = makeEasel(w.emoji);
    easel.position.set(-4.3, 0, segMinZ + 2.6);
    easel.rotation.y = 0.3;
    easel.userData.setWord('_ '.repeat(letters.length).trim());
    this.group.add(easel);
    this.collide(boxCollider(-4.3, segMinZ + 2.4, 1.3, 0.6, 3.6, 0));
    shadow(easel);

    this.rounds.push({
      word: w.word, emoji: w.emoji, voice: w.voice, found: 0, tiles, planks, bridge, easel,
      solved: false, solvedTime: 0, segMinZ, segMaxZ: r === 0 ? 9.5 : segMaxZ + 0.5,
    });
  }

  private progress(round: Round): string {
    return round.word.split('').map((c, i) => (i < round.found ? c : '_')).join(' ');
  }

  private showPanel(round: Round): void {
    this.game.showQuestion(`Eja: ${round.word} ${round.emoji}`, this.progress(round), round.voice);
  }

  intro(): { duration: number; camera(t: number, out: { pos: THREE.Vector3; look: THREE.Vector3 }): void } {
    return {
      duration: 4.2,
      camera: (t, out) => {
        const k = Math.min(1, t / 4.2);
        const e = k * k * (3 - 2 * k);
        // Start on the easel picture, then pull back over the book piles to Affan.
        out.pos.set(-2.6 + 2.6 * e, 3 + 1.1 * e, 2.4 + 11.9 * e);
        out.look.set(-4.3 + 4.3 * e, 2.4 - 1.3 * e, -3.4 + 9.8 * e);
      },
    };
  }

  protected tick(dt: number): void {
    this.tickObstacles(dt);
    const b = this.game.body;

    let active = -1;
    this.rounds.forEach((round, i) => {
      if (!round.solved && b.z <= round.segMaxZ && b.z >= round.segMinZ - 0.5) active = i;
    });
    if (active !== this.active) {
      this.active = active;
      if (active >= 0) this.showPanel(this.rounds[active]);
      else this.game.hideQuestion();
    }

    for (const round of this.rounds) {
      for (const t of round.tiles) {
        t.timer += dt;
        const on = b.grounded && b.ground === t.collider;
        if (!on) t.armed = true;
        if (t.state === 'idle') {
          t.shake = Math.max(0, t.shake - dt);
          t.sprite.position.y = t.top + 1.25 + Math.sin(t.timer * 2.2) * 0.1;
          t.sprite.position.x = t.x + Math.sin(t.timer * 30) * 0.12 * t.shake;
          if (on && t.armed && !round.solved && !this.game.busy) {
            t.armed = false;
            const next = round.word[round.found];
            if (t.letter === next) {
              t.state = 'flying';
              t.timer = 0;
              t.slot = round.found;
              t.from.copy(t.sprite.position);
              round.found++;
              this.game.audio.sfx('coin', { rate: 0.9 + round.found * 0.15 });
              this.game.sparkles.burst(t.sprite.position, 16);
              round.easel.userData.setWord(this.progress(round));
              // The found letter is painted on its plank.
              const p = round.planks[t.slot];
              const fresh = labelDecal(t.letter, { size: 1.2, color: '#ffffff', stroke: '#1d2a5c' });
              fresh.position.copy(p.label.position);
              p.label.removeFromParent();
              p.label = fresh;
              this.group.add(fresh);
              p.mat.opacity = 0.6;
              if (round.found === round.word.length) {
                round.solved = true;
                round.solvedTime = 0;
                round.bridge.enabled = true;
                this.game.praise(new THREE.Vector3(t.x, t.top + 1.5, t.z));
                this.game.addStar(new THREE.Vector3(t.x, t.top + 1.8, t.z));
                this.game.hideQuestion();
                this.active = -1;
              } else if (this.active >= 0) {
                this.showPanel(round);
              }
            } else if (round.word.includes(t.letter)) {
              // A letter of the word, but not the next one: it stays for later.
              t.shake = 0.8;
              this.game.audio.sfx('wrong', { volume: 0.6 });
              this.game.encourage();
            } else {
              t.state = 'gone';
              t.timer = 0;
              this.game.audio.sfx('wrong');
              this.game.encourage();
              this.game.affan.play('think', 1.1);
            }
          }
        } else if (t.state === 'gone') {
          t.sprite.position.x = t.x + Math.sin(t.timer * 30) * 0.12 * Math.max(0, 1 - t.timer * 1.4);
          t.sprite.material.opacity = Math.max(0.2, 1 - t.timer * 1.3);
        } else if (t.state === 'flying') {
          const k = Math.min(1, t.timer / 0.8);
          const e = k * k * (3 - 2 * k);
          const p = round.planks[t.slot];
          t.sprite.position.set(
            t.from.x + (0 - t.from.x) * e,
            t.from.y + (0.6 - t.from.y) * e + Math.sin(k * Math.PI) * 1.6,
            t.from.z + (p.z - t.from.z) * e,
          );
          t.sprite.material.opacity = 1 - Math.max(0, k - 0.7) / 0.3;
          if (k >= 1) t.sprite.visible = false;
        }
      }
      if (round.solved && round.solvedTime < 3) {
        round.solvedTime += dt;
        round.planks.forEach((p, i) => {
          const k = Math.max(0, Math.min(1, (round.solvedTime - 0.3 - i * 0.18) / 0.3));
          p.mat.opacity = Math.max(p.mat.opacity, 0.6 + 0.4 * k);
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
