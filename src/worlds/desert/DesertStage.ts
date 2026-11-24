import * as THREE from 'three';
import { boxCollider, discCollider, type Collider } from '../../engine/Physics';
import { makePalm, makeRock, mat, shadow } from '../../env/builders';
import {
  makeBoulder, makeCactus, makeColumn, makeDune, makePyramid, makeRuinWall, SAND, SAND_DARK, SANDSTONE, SANDSTONE_DARK,
} from '../../env/desert';
import { ObstacleStage, type Gate } from '../Obstacles';
import type { WorldTheme } from '../Stage';

export type { Gate };

export const DESERT_THEME: WorldTheme = {
  sky: [0x3f9bea, 0xfde6b0, 0xe9c46a],
  fog: { color: 0xf7e3b5, near: 42, far: 125 },
  sun: { color: 0xfff0c8, intensity: 3.0, dir: [-0.42, 1, 0.5] },
  ambient: { sky: 0xfff7e0, ground: 0xe2bd76, intensity: 1.25 },
  music: 'desert',
  ambience: { name: 'wind', volume: 0.3 },
  footstep: 'step_sand',
};

/** Shared desert building blocks: sand, quicksand pits, stone gates, moving platforms, rolling boulders. */
export abstract class DesertStage extends ObstacleStage {
  protected sand(minZ: number, maxZ: number, withWalls = true): void {
    this.ground(-28, 28, minZ, maxZ, 0, 4, SAND, SAND_DARK);
    if (withWalls) this.sideWalls(minZ, maxZ);
  }

  /** Soft sand far below the path. Falling in costs a heart and returns Affan to the checkpoint. */
  protected quicksand(minZ: number, maxZ: number, depth = 1.5): void {
    this.pitKind = 'sand';
    this.waterLevel = Math.max(this.waterLevel ?? -99, -depth + 0.35);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(56, maxZ - minZ), mat(0xd9a94e, 1));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -depth, (minZ + maxZ) / 2);
    floor.receiveShadow = true;
    this.group.add(floor);
    // Lazy swirls so the pit reads as soft, sinking sand.
    for (let i = 0; i < 5; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.5 + i * 0.1, 0.62 + i * 0.1, 24), mat(0xc48f3a, 1));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(-5 + i * 2.6, -depth + 0.02, minZ + 1 + ((i * 1.7) % Math.max(1, maxZ - minZ - 2)));
      this.group.add(ring);
    }
    this.sideWalls(minZ, maxZ);
  }

  /** A sandstone slab that slides from side to side, or shuttles forward and back. */
  protected platform(
    size: number, top: number,
    path: (time: number) => [number, number, number],
  ): Collider {
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(size, 0.4, size), mat(SANDSTONE, 0.95));
    slab.position.y = -0.2;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(size * 0.8, 0.02, size * 0.8), mat(0xf4dfa8, 0.95));
    trim.position.y = 0.012;
    const under = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.28, size * 0.12, 0.7, 8), mat(SANDSTONE_DARK, 0.95));
    under.position.y = -0.74;
    g.add(slab, trim, under);
    shadow(g);
    const c = boxCollider(0, 0, size / 2, size / 2, top, top - 0.4, 'platform');
    this.mover(g, c, path);
    return c;
  }

  /**
   * A round rock that rolls back and forth across the path. It is a moving
   * wall, so it nudges Affan aside; it never hurts him.
   */
  protected boulder(z: number, minX: number, maxX: number, period: number, phase = 0, radius = 0.8): void {
    const mesh = makeBoulder(radius);
    mesh.castShadow = true;
    shadow(mesh);
    const c = discCollider(0, z, radius * 0.92, radius * 1.85, 0, 'boulder');
    const mid = (minX + maxX) / 2;
    const amp = (maxX - minX) / 2;
    this.pusher(mesh, c, radius, (time) => [mid + Math.sin((time / period) * Math.PI * 2 + phase) * amp, radius * 1.85, z], -radius * 0.85);
  }

  /** A wall across the path with a stone door that slides down when opened. */
  protected gate(z: number, emblem?: THREE.Object3D): Gate {
    const doorHalf = 1.7;
    const height = 3.3;
    const stone = mat(SANDSTONE, 0.95);
    const dark = mat(SANDSTONE_DARK, 0.95);
    for (const s of [-1, 1]) {
      const inner = doorHalf;
      const outer = this.half + 5;
      const w = outer - inner;
      const wing = new THREE.Mesh(new THREE.BoxGeometry(w, height, 0.9), stone);
      wing.position.set(s * (inner + w / 2), height / 2, z);
      this.decor.add(wing);
      this.collide(boxCollider(s * (inner + w / 2), z, w / 2, 0.45, height, 0));
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.7, height + 0.6, 1.2), dark);
      pillar.position.set(s * (doorHalf + 0.2), (height + 0.6) / 2, z);
      this.decor.add(pillar);
      for (let i = 0; i < 4; i++) {
        const crenel = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.9), dark);
        crenel.position.set(s * (inner + 1 + i * 1.5), height + 0.22, z);
        this.decor.add(crenel);
      }
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorHalf * 2 + 1.4, 0.7, 1.2), dark);
    lintel.position.set(0, height + 0.5, z);
    this.decor.add(lintel);
    this.collide(boxCollider(0, z, doorHalf, 0.45, height + 0.85, height + 0.15));
    const door = new THREE.Mesh(new THREE.BoxGeometry(doorHalf * 2 - 0.1, height + 0.1, 0.5), mat(0x9a6b3c, 0.9));
    door.position.set(0, height / 2, z);
    shadow(door);
    this.group.add(door);
    if (emblem) {
      emblem.position.set(0, 0, 0.27);
      door.add(emblem);
    }
    const collider = this.collide(boxCollider(0, z, doorHalf, 0.3, height, 0, 'door'));
    return this.door(door, collider, z, 3.5);
  }

  /** Dunes, cacti, palms, rocks and ruins along both sides of the path. */
  protected desertBorders(rand: () => number, minZ: number, maxZ: number, opts: { ruins?: boolean; y?: number; noCacti?: boolean } = {}): void {
    const inner = this.half + 2.2;
    const len = maxZ - minZ;
    const y = opts.y ?? 0;
    for (const side of [-1, 1]) {
      for (let i = 0; i < len / 9; i++) {
        const dune = makeDune(9 + rand() * 9, 1.2 + rand() * 2.2, 7 + rand() * 6, rand() < 0.5 ? SAND : 0xf2d590);
        dune.position.set(side * (inner + 6 + rand() * 12), y - 0.05, minZ + rand() * len);
        this.decor.add(dune);
      }
      for (let i = 0; i < len / 3.2; i++) {
        const z = minZ + rand() * len;
        const x = side * (inner + rand() * 9);
        const roll = rand();
        let obj: THREE.Object3D;
        // Counting stages leave stray cacti out so the ones to count are unmistakable.
        if (roll < 0.42 && !opts.noCacti) obj = makeCactus(rand, 0.8 + rand() * 0.7);
        else if (roll < 0.42) obj = makeRock(rand, 0.7 + rand() * 0.8, 0xd8b377);
        else if (roll < 0.58) obj = makePalm(rand, 0.85 + rand() * 0.3);
        else if (roll < 0.8 || !opts.ruins) obj = makeRock(rand, 0.8 + rand() * 1.1, 0xc9a56c);
        else if (roll < 0.92) obj = makeColumn(1.6 + rand() * 2.6);
        else {
          obj = makeRuinWall(rand, 3 + rand() * 3, 1.6 + rand() * 1.4);
          obj.rotation.y = side * (Math.PI / 2 + (rand() - 0.5) * 0.6);
        }
        obj.position.set(x, y + (roll >= 0.58 && roll < 0.8 ? 0.15 : 0), z);
        this.decor.add(obj);
      }
    }
  }

  /** Pyramids on the horizon. */
  protected horizon(rand: () => number, z: number): void {
    for (let i = 0; i < 3; i++) {
      const p = makePyramid(14 + rand() * 10, i % 2 ? 0xdcb880 : 0xcfa66a);
      p.position.x = -30 + i * 30 + (rand() - 0.5) * 8;
      p.position.z = z - rand() * 12;
      this.decor.add(p);
    }
  }

  /** Doors sliding, boulders rolling and bumping. Call from tick(). */
  protected tickDesert(dt: number): void {
    this.tickObstacles(dt);
  }
}
