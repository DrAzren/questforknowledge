import * as THREE from 'three';
import { boxCollider, discCollider, type Collider } from '../../engine/Physics';
import { makeRock, makeWater, mat } from '../../env/builders';
import {
  CRYSTAL_COLORS, makeCrystals, makeEmbers, makeFallingRock, makeNumberRock, makeRockSlab, makeSpire, makeSteam,
  makeVolcano, ROCK, ROCK_DARK,
} from '../../env/volcano';
import { ObstacleStage } from '../Obstacles';
import type { WorldTheme } from '../Stage';

export const VOLCANO_THEME: WorldTheme = {
  sky: [0x6d4a9c, 0xffb88a, 0xd9552b],
  fog: { color: 0xf5b08c, near: 40, far: 120 },
  sun: { color: 0xffe0b8, intensity: 2.6, dir: [-0.4, 1, 0.55] },
  ambient: { sky: 0xffe9d6, ground: 0xc86a4a, intensity: 1.3 },
  music: 'volcano',
  ambience: { name: 'lava_amb', volume: 0.28 },
  footstep: 'step_rock',
};

export const LAVA_Y = -0.6;

interface Bridge {
  mesh: THREE.Object3D;
  collider: Collider;
  raised: boolean;
  t: number;
}

interface Drop {
  phase: 'warn' | 'fall' | 'rest';
  t: number;
  x: number;
  y: number;
  z: number;
  shadow: THREE.Mesh;
  rock: THREE.Mesh;
  collider: Collider | null;
}

interface RockZone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y: number;
  interval: number;
  timer: number;
}

/** A numbered rock to hop on as an answer. */
export interface AnswerRock {
  value: number;
  mesh: THREE.Group;
  collider: Collider;
  x: number;
  z: number;
  base: number;
  state: 'idle' | 'wrong' | 'sunk' | 'right';
  timer: number;
}

export const ANSWER_R = 1.0;
export const ANSWER_H = 0.6;

/** Shared volcano building blocks: rock ground, lava, bridges that rise from it, rock platforms, falling rocks. */
export abstract class VolcanoStage extends ObstacleStage {
  private bridges: Bridge[] = [];
  private drops: Drop[] = [];
  private zones: RockZone[] = [];

  /** A stretch of rock ground, optionally raised as a terrace. Side walls reach well above the highest terrace. */
  protected rock(minZ: number, maxZ: number, top = 0, depth = 4): void {
    this.ground(-28, 28, minZ, maxZ, top, depth, ROCK, ROCK_DARK);
    this.wall(-this.half - 1.4, -this.half, minZ, maxZ, 30, -6);
    this.wall(this.half, this.half + 1.4, minZ, maxZ, 30, -6);
  }

  /** A glowing lava channel. Touching it is a cartoon "hot!": a sizzle, a puff of steam, back to the checkpoint. */
  protected lava(minZ: number, maxZ: number): void {
    this.pitKind = 'lava';
    this.waterLevel = LAVA_Y;
    const len = maxZ - minZ;
    const lava = makeWater(56, len, 0xffc23c, 0xf0531c);
    lava.position.set(0, LAVA_Y, (minZ + maxZ) / 2);
    this.add(lava);
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(56, len), mat(0xd9480f, 1));
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(0, LAVA_Y - 0.6, (minZ + maxZ) / 2);
    this.group.add(bed);
    this.add(makeEmbers(-9, 9, minZ, maxZ, LAVA_Y, Math.min(70, Math.round(len * 7))));
    this.wall(-this.half - 1.4, -this.half, minZ, maxZ, 30, -6);
    this.wall(this.half, this.half + 1.4, minZ, maxZ, 30, -6);
  }

  /** A slab of rock that drifts along a path as a platform. */
  protected rockPlatform(size: number, top: number, path: (time: number) => [number, number, number]): Collider {
    const c = boxCollider(0, 0, size / 2, size / 2, top, top - 0.5, 'platform');
    this.mover(makeRockSlab(size, size), c, path);
    return c;
  }

  /** A bridge of cooled rock lying hidden in the lava until it is raised. */
  protected rockBridge(minZ: number, maxZ: number, width = 3): { raise(): void; readonly raised: boolean } {
    const mesh = makeRockSlab(width, maxZ - minZ - 0.1);
    mesh.position.set(0, -1.6, (minZ + maxZ) / 2);
    this.group.add(mesh);
    const collider = this.collide(boxCollider(0, (minZ + maxZ) / 2, width / 2, (maxZ - minZ) / 2, 0, -0.5, 'bridge'));
    collider.enabled = false;
    const state: Bridge = { mesh, collider, raised: false, t: 0 };
    this.bridges.push(state);
    const game = this.game;
    return {
      raise(): void {
        if (state.raised) return;
        state.raised = true;
        collider.enabled = true;
        game.audio.sfx('rock_rise');
      },
      get raised(): boolean {
        return state.raised;
      },
    };
  }

  /** Three numbered rocks in a row to hop on. */
  protected answerRocks(values: number[], z: number, base: number, rand: () => number): AnswerRock[] {
    const xs = [-3.6, 0, 3.6];
    return values.map((value, i) => {
      const mesh = makeNumberRock(ANSWER_R, ANSWER_H, String(value), rand, CRYSTAL_COLORS[i % CRYSTAL_COLORS.length]);
      mesh.position.set(xs[i], base + ANSWER_H, z);
      this.group.add(mesh);
      const collider = this.collide(discCollider(xs[i], z, ANSWER_R, base + ANSWER_H, base, 'answer'));
      return { value, mesh, collider, x: xs[i], z, base, state: 'idle', timer: 0 };
    });
  }

  /**
   * Run the hop-on-a-number logic for one set of answer rocks. Returns 'right'
   * or 'wrong' on the frame Affan chooses, otherwise null. A wrong rock shakes
   * and settles gently to the ground with him on it.
   */
  protected tickAnswerRocks(rocks: AnswerRock[], answer: number, open: boolean, dt: number): { result: 'right' | 'wrong'; rock: AnswerRock } | null {
    const b = this.game.body;
    let out: { result: 'right' | 'wrong'; rock: AnswerRock } | null = null;
    for (const r of rocks) {
      const face = r.mesh.userData.face as THREE.Mesh;
      if (r.state === 'idle') {
        if (open && b.grounded && b.ground === r.collider && !this.game.busy) {
          if (r.value === answer) {
            r.state = 'right';
            (face.material as THREE.MeshBasicMaterial).color.setHex(0x8ce99a);
            out = { result: 'right', rock: r };
          } else {
            r.state = 'wrong';
            r.timer = 0;
            (face.material as THREE.MeshBasicMaterial).color.setHex(0xffc9c9);
            out = { result: 'wrong', rock: r };
          }
        }
      } else if (r.state === 'wrong') {
        r.timer += dt;
        r.mesh.rotation.z = Math.sin(r.timer * 30) * 0.05 * Math.max(0, 1 - r.timer / 0.6);
        if (r.timer > 0.6) {
          const top = Math.max(r.base + 0.12, r.base + ANSWER_H - (r.timer - 0.6) * 0.5);
          this.game.physics.moveTo(r.collider, r.x, top, r.z);
          r.mesh.position.y = top;
          if (top <= r.base + 0.12) {
            r.state = 'sunk';
            r.mesh.rotation.z = 0;
          }
        }
      }
    }
    return out;
  }

  /** Small rocks tumble down inside this area now and then. A shadow always warns where the next one lands. */
  protected fallingRocks(minX: number, maxX: number, minZ: number, maxZ: number, y = 0, interval = 1.7): void {
    this.zones.push({ minX, maxX, minZ, maxZ, y, interval, timer: interval * 0.6 });
  }

  /** Start one rock falling toward (x, z). Public so the stage tests can place one exactly. */
  dropRock(x: number, z: number, y = 0): void {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 20),
      new THREE.MeshBasicMaterial({ color: 0x2b1b25, transparent: true, opacity: 0.0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(x, y + 0.03, z);
    this.group.add(shadow);
    const rock = makeFallingRock(0.6);
    rock.visible = false;
    this.group.add(rock);
    this.drops.push({ phase: 'warn', t: 0, x, y, z, shadow, rock, collider: null });
  }

  /** Rock spires, crystals and steam vents along both sides. */
  protected volcanoBorders(rand: () => number, minZ: number, maxZ: number, y = 0): void {
    const inner = this.half + 2.2;
    const len = maxZ - minZ;
    for (const side of [-1, 1]) {
      for (let i = 0; i < len / 3.4; i++) {
        const z = minZ + rand() * len;
        const x = side * (inner + rand() * 9);
        const roll = rand();
        if (roll < 0.45) {
          const spire = makeSpire(rand, 0.8 + rand() * 0.9);
          spire.position.set(x, y, z);
          this.decor.add(spire);
        } else if (roll < 0.75) {
          const crystals = makeCrystals(rand, CRYSTAL_COLORS[Math.floor(rand() * CRYSTAL_COLORS.length)], 1 + rand() * 0.8, 4 + Math.floor(rand() * 3));
          crystals.position.set(x, y, z);
          this.decor.add(crystals);
        } else if (roll < 0.9) {
          const rock = makeRock(rand, 1 + rand() * 1.2, ROCK_DARK);
          rock.position.set(x, y + 0.2, z);
          this.decor.add(rock);
        } else {
          const steam = makeSteam(2.4 + rand());
          steam.position.set(x, y, z);
          this.add(steam);
        }
      }
    }
  }

  /** Volcanoes on the horizon. */
  protected skyline(z: number, y = 0): void {
    const big = makeVolcano(34);
    big.position.set(6, y - 4, z);
    this.add(big);
    const small = makeVolcano(20);
    small.position.set(-34, y - 3, z + 8);
    this.add(small);
  }

  /** Bridges rising, rocks falling, plus the shared doors and pushers. Call from tick(). */
  protected tickVolcano(dt: number): void {
    this.tickObstacles(dt);
    for (const br of this.bridges) {
      if (br.raised && br.t < 1) {
        br.t = Math.min(1, br.t + dt / 0.9);
        const e = br.t * br.t * (3 - 2 * br.t);
        br.mesh.position.y = -1.6 + e * 1.6 + Math.sin(br.t * 40) * 0.03 * (1 - br.t);
      }
    }
    const b = this.game.body;
    for (const zone of this.zones) {
      zone.timer -= dt;
      if (zone.timer <= 0) {
        zone.timer = zone.interval * (0.75 + this.game.rand() * 0.5);
        if (this.drops.length < 4) {
          const r = this.game.rand;
          this.dropRock(zone.minX + r() * (zone.maxX - zone.minX), zone.minZ + r() * (zone.maxZ - zone.minZ), zone.y);
        }
      }
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt;
      const shadowMat = d.shadow.material as THREE.MeshBasicMaterial;
      if (d.phase === 'warn') {
        // The shadow grows for well over a second: plenty of time to step aside.
        const k = Math.min(1, d.t / 1.4);
        shadowMat.opacity = 0.15 + k * 0.35;
        d.shadow.scale.setScalar(0.35 + k * 0.65);
        if (d.t >= 1.4) {
          d.phase = 'fall';
          d.t = 0;
          d.rock.visible = true;
        }
      } else if (d.phase === 'fall') {
        const k = Math.min(1, d.t / 0.45);
        d.rock.position.set(d.x, d.y + 0.5 + (1 - k * k) * 9, d.z);
        d.rock.rotation.x += dt * 6;
        if (k >= 1) {
          d.phase = 'rest';
          d.t = 0;
          const dist = Math.hypot(b.x - d.x, b.z - d.z);
          // Only rocks landing nearby are heard; far ones would be a constant tapping.
          if (dist < 15) this.game.audio.sfx('rock_fall', { volume: 1 - dist / 16, minGap: 0.1 });
          this.game.sparkles.burst(new THREE.Vector3(d.x, d.y + 0.3, d.z), 10, [0xb9a39b, 0x8a7482, 0xe0cfc6], 2.4);
          if (dist < 1.15 && Math.abs(b.y - d.y) < 1.4 && !this.game.busy) {
            // A soft bonk: Affan is nudged away, startled, and that is all.
            const nx = dist > 0.05 ? (b.x - d.x) / dist : 1;
            const nz = dist > 0.05 ? (b.z - d.z) / dist : 0;
            b.vx = nx * 6;
            b.vz = nz * 6;
            this.game.audio.sfx('bump');
            this.game.affan.play('surprised', 0.7);
          }
          d.collider = this.collide(discCollider(d.x, d.z, 0.55, d.y + 1.0, d.y, 'fallen'));
        }
      } else {
        shadowMat.opacity = Math.max(0, 0.5 - d.t);
        if (d.t > 1.1) {
          const k = Math.min(1, (d.t - 1.1) / 0.4);
          d.rock.scale.setScalar(1 - k);
          if (k >= 1) {
            if (d.collider) this.game.physics.remove(d.collider);
            d.rock.removeFromParent();
            d.shadow.removeFromParent();
            this.drops.splice(i, 1);
          }
        }
      }
    }
  }
}
