import * as THREE from 'three';
import { boxCollider, discCollider, type Collider } from '../../engine/Physics';
import { makeWater, mat } from '../../env/builders';
import {
  ICE_DEEP, makeAnswerPad, makeIceCrystals, makeIceFloe, makeIcePlank, makeMountain, makePenguin, makeSnowball, makeSnowfall,
  makeSnowman, makeSnowTree, SNOW, SNOW_SHADE, type AnswerPadMesh, type FaceSpec, type PenguinMode,
} from '../../env/snow';
import { ObstacleStage } from '../Obstacles';
import type { WorldTheme } from '../Stage';

export const SNOW_THEME: WorldTheme = {
  sky: [0x4f9fe8, 0xcbe7ff, 0xeaf6ff],
  fog: { color: 0xd8ecff, near: 38, far: 125 },
  sun: { color: 0xfff4e0, intensity: 2.15, dir: [-0.45, 1, 0.5] },
  ambient: { sky: 0xeef5ff, ground: 0xb4cdf0, intensity: 1.3 },
  music: 'snow',
  ambience: { name: 'wind', volume: 0.16 },
  footstep: 'step_snow',
};

/** The look the kingdom takes on when the Frozen Crystal wakes: a violet evening under the northern lights. */
export const MAGIC_THEME: WorldTheme = {
  sky: [0x1a1a5e, 0x7a5fd6, 0xffa8d8],
  fog: { color: 0xa99be8, near: 45, far: 140 },
  sun: { color: 0xffe0f5, intensity: 1.7, dir: [-0.45, 1, 0.5] },
  ambient: { sky: 0xd4c4ff, ground: 0x86b4ff, intensity: 1.45 },
  music: 'finale',
  footstep: 'step_snow',
};

export const WATER_Y = -0.6;
export const PAD_R = 1.0;
export const PAD_H = 0.6;
export const PAD_X = [-3.6, 0, 3.6];
export const ICE_TINTS = [0x9be7ff, 0xc9b6ff, 0xa5f3e0];

export type Answer = string | number;

export interface AnswerPad {
  value: Answer;
  mesh: AnswerPadMesh;
  collider: Collider;
  x: number;
  z: number;
  base: number;
  state: 'idle' | 'right' | 'wrong' | 'sunk';
  timer: number;
  /** False while Affan is still standing on it from the previous question: he must hop to choose. */
  armed: boolean;
}

export interface IceBridge {
  freeze(): void;
  readonly frozen: boolean;
}

export interface SnowQuestion {
  prompt: string;
  detail?: string;
  voice?: string;
  answer: Answer;
  options: { value: Answer; face: FaceSpec }[];
}

export interface SnowRound {
  question: SnowQuestion;
  pads: AnswerPad[];
  bridge: IceBridge;
  solved: boolean;
  /** Seconds this round's question has been showing. */
  shown: number;
  zoneMinZ: number;
  zoneMaxZ: number;
  /** Called every frame while this round's question is showing (or once solved). */
  whileShown?: (round: SnowRound, dt: number) => void;
  onSolved?: (round: SnowRound) => void;
}

interface BridgeState {
  planks: THREE.Object3D[];
  collider: Collider;
  frozen: boolean;
  t: number;
  x: number;
  minZ: number;
  maxZ: number;
}

/** Text answers (letters, numbers) as pad faces. */
export function textOptions(values: Answer[]): { value: Answer; face: FaceSpec }[] {
  return values.map((value) => ({ value, face: { kind: 'text', text: String(value) } }));
}

/** Shared snow-world building blocks: snow ground, icy water, bridges that freeze into place, answer blocks of ice. */
export abstract class SnowStage extends ObstacleStage {
  private bridges: BridgeState[] = [];
  private sliders: { mesh: THREE.Object3D; collider: Collider; lastX: number }[] = [];
  private snowfall = makeSnowfall();
  /** Materials of every ice crystal in the stage, so the finale can make them all glow. */
  protected crystalMats = ICE_TINTS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.2, emissive: c, emissiveIntensity: 0.45, flatShading: true }));
  /** Penguins standing about, so they can all cheer at once. */
  protected penguins: ReturnType<typeof makePenguin>[] = [];
  rounds: SnowRound[] = [];
  protected active = -1;

  /** A stretch of snowy ground with side walls. */
  protected snow(minZ: number, maxZ: number, top = 0, depth = 4): void {
    this.ground(-30, 30, minZ, maxZ, top, depth, SNOW, 0x9cc3e8);
    this.wall(-this.half - 1.4, -this.half, minZ, maxZ, 30, -6);
    this.wall(this.half, this.half + 1.4, minZ, maxZ, 30, -6);
  }

  /** A channel of icy water. Falling in is a cold splash and a trip back to the checkpoint. */
  protected icyWater(minZ: number, maxZ: number, rand: () => number): void {
    this.pitKind = 'water';
    this.waterLevel = WATER_Y;
    const len = maxZ - minZ;
    const water = makeWater(60, len, 0xc4ecff, 0x3d8fd1);
    water.position.set(0, WATER_Y, (minZ + maxZ) / 2);
    this.add(water);
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(60, len), mat(0x2f78b8, 1));
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(0, WATER_Y - 0.7, (minZ + maxZ) / 2);
    this.group.add(bed);
    // Loose ice drifting at the edges, well away from where anyone could try to stand on it.
    for (const side of [-1, 1]) {
      for (let i = 0; i < Math.max(1, Math.round(len / 4)); i++) {
        const chunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5 + rand() * 0.7, 0.5 + rand() * 0.6, 0.3, 7), mat(SNOW, 0.9));
        chunk.position.set(side * (9 + rand() * 12), WATER_Y + 0.08, minZ + 0.8 + rand() * (len - 1.6));
        this.decor.add(chunk);
      }
    }
    this.wall(-this.half - 1.4, -this.half, minZ, maxZ, 30, -6);
    this.wall(this.half, this.half + 1.4, minZ, maxZ, 30, -6);
  }

  /** A bridge that is not there until the water freezes, plank by plank, from the near bank. */
  protected iceBridge(minZ: number, maxZ: number, width = 3, x = 0): IceBridge {
    const n = Math.max(2, Math.round(maxZ - minZ));
    const len = (maxZ - minZ) / n;
    const planks: THREE.Object3D[] = [];
    for (let i = 0; i < n; i++) {
      const p = makeIcePlank(width, len);
      p.position.set(x, 0, maxZ - (i + 0.5) * len);
      p.visible = false;
      this.group.add(p);
      planks.push(p);
    }
    const collider = this.collide(boxCollider(x, (minZ + maxZ) / 2, width / 2, (maxZ - minZ) / 2, 0, -0.4, 'bridge'));
    collider.enabled = false;
    const state: BridgeState = { planks, collider, frozen: false, t: 0, x, minZ, maxZ };
    this.bridges.push(state);
    const game = this.game;
    return {
      freeze(): void {
        if (state.frozen) return;
        state.frozen = true;
        collider.enabled = true;
        game.audio.sfx('ice_form');
      },
      get frozen(): boolean {
        return state.frozen;
      },
    };
  }

  /** A sheet of ice that drifts along a path as a platform. */
  protected floe(size: number, path: (time: number) => [number, number, number]): Collider {
    const c = boxCollider(0, 0, size / 2 * 0.82, size / 2 * 0.82, 0, -0.5, 'platform');
    this.mover(makeIceFloe(size), c, path);
    return c;
  }

  /** Three blocks of ice in a row, each showing one possible answer. */
  protected pads(options: { value: Answer; face: FaceSpec }[], z: number, base = 0, xs = PAD_X): AnswerPad[] {
    return options.map((o, i) => {
      const mesh = makeAnswerPad(PAD_R, PAD_H);
      mesh.userData.setFace(o.face);
      mesh.position.set(xs[i], base + PAD_H, z);
      this.group.add(mesh);
      const collider = this.collide(discCollider(xs[i], z, PAD_R, base + PAD_H, base, 'answer'));
      return { value: o.value, mesh, collider, x: xs[i], z, base, state: 'idle', timer: 0, armed: true };
    });
  }

  /** Raise the blocks again with a new set of answers. */
  protected resetPads(pads: AnswerPad[], options: { value: Answer; face: FaceSpec }[]): void {
    const b = this.game.body;
    pads.forEach((p, i) => {
      p.value = options[i].value;
      p.mesh.userData.setFace(options[i].face);
      p.state = 'idle';
      p.timer = 0;
      p.mesh.rotation.z = 0;
      p.armed = !(b.grounded && b.ground === p.collider);
      this.game.physics.moveTo(p.collider, p.x, p.base + PAD_H, p.z);
      p.mesh.position.y = p.base + PAD_H;
    });
  }

  /**
   * Run the hop-on-an-answer logic for one row of blocks. Returns the choice on
   * the frame Affan makes it. A wrong block turns pink and settles gently to
   * the ground with him on it.
   */
  protected tickPads(pads: AnswerPad[], answer: Answer, open: boolean, dt: number): { result: 'right' | 'wrong'; pad: AnswerPad } | null {
    const b = this.game.body;
    let out: { result: 'right' | 'wrong'; pad: AnswerPad } | null = null;
    for (const p of pads) {
      const on = b.grounded && b.ground === p.collider;
      if (!p.armed) {
        if (!on) p.armed = true;
        continue;
      }
      if (p.state === 'idle') {
        if (open && on && !this.game.busy) {
          if (p.value === answer) {
            p.state = 'right';
            p.mesh.userData.setState('right');
            out = { result: 'right', pad: p };
          } else {
            p.state = 'wrong';
            p.timer = 0;
            p.mesh.userData.setState('wrong');
            out = { result: 'wrong', pad: p };
          }
        }
      } else if (p.state === 'wrong') {
        p.timer += dt;
        p.mesh.rotation.z = Math.sin(p.timer * 30) * 0.05 * Math.max(0, 1 - p.timer / 0.6);
        if (p.timer > 0.6) {
          const top = Math.max(p.base + 0.12, p.base + PAD_H - (p.timer - 0.6) * 0.5);
          this.game.physics.moveTo(p.collider, p.x, top, p.z);
          p.mesh.position.y = top;
          if (top <= p.base + 0.12) {
            p.state = 'sunk';
            p.mesh.rotation.z = 0;
          }
        }
      }
    }
    return out;
  }

  /** One question on the path: a row of answer blocks, and the water beyond that freezes when it is solved. */
  protected addRound(
    question: SnowQuestion, padZ: number, channel: [number, number], zoneMaxZ: number,
    extra: Pick<SnowRound, 'whileShown' | 'onSolved'> = {},
  ): SnowRound {
    const round: SnowRound = {
      question,
      pads: this.pads(question.options, padZ),
      bridge: this.iceBridge(channel[0], channel[1]),
      solved: false,
      shown: 0,
      zoneMinZ: channel[1] - 0.5,
      zoneMaxZ,
      ...extra,
    };
    this.rounds.push(round);
    return round;
  }

  /** Show the right question for where Affan is, and handle his answers. Call from tick(). */
  protected tickRounds(dt: number): void {
    const b = this.game.body;
    let active = -1;
    this.rounds.forEach((round, i) => {
      if (!round.solved && b.z <= round.zoneMaxZ && b.z >= round.zoneMinZ) active = i;
    });
    if (active !== this.active) {
      this.active = active;
      if (active >= 0) {
        const q = this.rounds[active].question;
        this.game.showQuestion(q.prompt, q.detail, q.voice);
      } else {
        this.game.hideQuestion();
      }
    }
    this.rounds.forEach((round, i) => {
      if (i === this.active || round.solved) {
        round.shown += dt;
        round.whileShown?.(round, dt);
      }
      const hit = this.tickPads(round.pads, round.question.answer, !round.solved, dt);
      if (!hit) return;
      if (hit.result === 'right') {
        round.solved = true;
        this.game.praise(new THREE.Vector3(hit.pad.x, 1.8, hit.pad.z));
        this.game.addStar(new THREE.Vector3(hit.pad.x, 2.1, hit.pad.z));
        round.bridge.freeze();
        round.onSolved?.(round);
      } else {
        this.game.audio.sfx('wrong');
        this.game.encourage();
        this.game.affan.play('think', 1.1);
      }
    });
  }

  /** A penguin standing about (it sways, and can be told to cheer). */
  protected penguin(x: number, y: number, z: number, heading = 0, mode: PenguinMode = 'stand'): ReturnType<typeof makePenguin> {
    const p = makePenguin(x * 1.3 + z * 0.7);
    p.position.set(x, y, z);
    p.rotation.y = heading;
    p.userData.mode = mode;
    this.add(p);
    this.penguins.push(p);
    return p;
  }

  /** A penguin belly-sliding back and forth across the path. It bumps, squawks, and never hurts. */
  protected penguinSlider(z: number, period = 6, phase = 0, y = 0): void {
    const p = makePenguin(phase);
    p.userData.mode = 'slide';
    p.scale.setScalar(1.15);
    const collider = discCollider(0, z, 0.5, y + 0.62, y, 'penguin');
    this.pusher(p, collider, 0.5, (t) => [Math.sin((t / period) * Math.PI * 2 + phase) * 5.2, y + 0.62, z], -0.62, false, 'penguin');
    this.updatables.push(p);
    this.sliders.push({ mesh: p, collider, lastX: collider.x });
  }

  /** A big snowball rolling back and forth across the path. */
  protected snowball(z: number, period = 7, y = 0): void {
    this.pusher(makeSnowball(0.8), discCollider(0, z, 0.74, y + 1.48, y, 'snowball'), 0.8,
      (t) => [Math.sin((t / period) * Math.PI * 2) * 5.2, y + 1.48, z], -0.68);
  }

  /** Snowy pines, snowmen, drifts and ice crystals along both sides. */
  protected snowBorders(rand: () => number, minZ: number, maxZ: number, y = 0, sides = [-1, 1], setBack = 0): void {
    const inner = this.half + 2.4 + setBack;
    const len = maxZ - minZ;
    for (const side of sides) {
      for (let i = 0; i < len / 3.1; i++) {
        const z = minZ + rand() * len;
        const x = side * (inner + rand() * 10);
        const roll = rand();
        if (roll < 0.48) {
          const tree = makeSnowTree(rand, 1 + rand() * 0.7);
          tree.position.set(x, y, z);
          this.decor.add(tree);
        } else if (roll < 0.68) {
          const c = makeIceCrystals(rand, this.crystalMats[Math.floor(rand() * this.crystalMats.length)], 1 + rand() * 0.9, 4 + Math.floor(rand() * 3));
          c.position.set(x, y, z);
          this.decor.add(c);
        } else if (roll < 0.8) {
          const man = makeSnowman(rand);
          man.position.set(side * (inner + rand() * 3), y, z);
          man.rotation.y = -side * (0.5 + rand() * 0.5);
          this.decor.add(man);
        } else {
          const drift = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), mat(rand() < 0.5 ? SNOW : SNOW_SHADE, 0.95));
          drift.scale.set(1.4 + rand() * 1.6, 0.35 + rand() * 0.4, 1.2 + rand() * 1.2);
          drift.position.set(x, y, z);
          this.decor.add(drift);
        }
      }
    }
  }

  /** Snow-capped mountains on the horizon. */
  protected skyline(z: number, y = 0): void {
    const peaks: [number, number, number][] = [[4, 38, 0], [-34, 26, 10], [36, 30, 6], [-64, 34, -4], [68, 24, 14]];
    for (const [x, size, dz] of peaks) {
      const m = makeMountain(size);
      m.position.set(x, y - 3, z + dz);
      this.decor.add(m);
    }
  }

  /** Start the snowfall. Call once from build(). */
  protected startSnow(): void {
    this.add(this.snowfall);
  }

  /** Bridges freezing, penguins turning, snow falling, plus the shared doors and pushers. Call from tick(). */
  protected tickSnow(dt: number): void {
    this.tickObstacles(dt);
    const b = this.game.body;
    this.snowfall.userData.center.set(b.x, Math.max(0, b.y), b.z);
    for (const br of this.bridges) {
      if (!br.frozen || br.t > 3) continue;
      const before = br.t;
      br.t += dt;
      br.planks.forEach((p, i) => {
        const start = i * 0.1;
        const k = Math.max(0, Math.min(1, (br.t - start) / 0.28));
        p.visible = k > 0;
        // Each plank pops up a little too big, then settles.
        const s = k < 1 ? k * (1 + Math.sin(k * Math.PI) * 0.25) : 1;
        p.scale.set(s, Math.max(0.01, s), s);
        if (before <= start && br.t > start) {
          this.game.sparkles.burst(new THREE.Vector3(br.x, 0.3, p.position.z), 8, [0xffffff, 0xbfe9ff, 0x9be7ff], 2.6);
        }
      });
    }
    for (const s of this.sliders) {
      const dx = s.collider.x - s.lastX;
      s.lastX = s.collider.x;
      if (Math.abs(dx) > 1e-5) s.mesh.rotation.y = dx > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
  }

  /** Everything icy glows by this much extra (0 = normal). */
  protected glow(k: number): void {
    for (const m of this.crystalMats) m.emissiveIntensity = 0.45 + k * 1.6;
  }
}

export { ICE_DEEP };
