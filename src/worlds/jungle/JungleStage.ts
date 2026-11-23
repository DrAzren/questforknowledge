import * as THREE from 'three';
import {
  makeBird, makeBush, makeButterflies, makeFlowers, makeGrassTufts, makePalm, makeRock, makeTree, makeVine, mergeInto,
  type Updatable,
} from '../../env/builders';
import { StageBase, type WorldTheme } from '../Stage';

export const JUNGLE_THEME: WorldTheme = {
  sky: [0x3b9dff, 0xc9f0ff, 0x9ad9a0],
  fog: { color: 0xc4ecd9, near: 34, far: 105 },
  sun: { color: 0xfff1d0, intensity: 2.6, dir: [-0.55, 1, 0.45] },
  ambient: { sky: 0xeaf8ff, ground: 0xb9c79a, intensity: 1.25 },
  music: 'jungle',
  ambience: { name: 'jungle_amb', volume: 0.35 },
  footstep: 'step_grass',
};

/**
 * Collapse every static mesh under `root` into one mesh per material.
 * A jungle has hundreds of leaves and trunks; merged, they cost a handful of
 * draw calls, which is what keeps the frame rate smooth on phones.
 */
export function mergeStatic(root: THREE.Object3D): THREE.Group {
  const out = new THREE.Group();
  out.add(...root.children.slice());
  mergeInto(out);
  out.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.receiveShadow = true;
  });
  return out;
}

/** Shared jungle dressing for the three jungle stages. */
export abstract class JungleStage extends StageBase {
  /** Static scenery collected here is merged into a few meshes at the end of build(). */
  protected decor = new THREE.Group();

  /** Line both sides of a path with trees, palms, bushes, rocks and flowers. */
  protected jungleBorders(
    rand: () => number, minZ: number, maxZ: number, innerX: number, outerX: number,
    opts: { density?: number; y?: number; skip?: (x: number, z: number) => boolean } = {},
  ): void {
    const y = opts.y ?? 0;
    const density = opts.density ?? 1;
    const len = maxZ - minZ;
    const count = Math.floor((len / 4.2) * density);
    for (const side of [-1, 1]) {
      for (let i = 0; i < count; i++) {
        const z = minZ + ((i + rand() * 0.8) / count) * len;
        const x = side * (innerX + 1.2 + rand() * (outerX - innerX - 1.2));
        if (opts.skip?.(x, z)) continue;
        const tree = rand() < 0.32 ? makePalm(rand, 0.9 + rand() * 0.4) : makeTree(rand, 0.85 + rand() * 0.6);
        tree.position.set(x, y, z);
        tree.rotation.y = rand() * 6;
        this.decor.add(tree);
        if (rand() < 0.5) {
          const vine = makeVine(1.4 + rand() * 1.6, rand);
          vine.position.set(x - side * (0.9 + rand()), y + 3.6 + rand(), z + rand() - 0.5);
          this.add(vine);
        }
      }
      for (let i = 0; i < count * 1.6; i++) {
        const z = minZ + rand() * len;
        const x = side * (innerX + 0.2 + rand() * 2.6);
        if (opts.skip?.(x, z)) continue;
        if (rand() < 0.3) {
          const rock = makeRock(rand, 0.7 + rand() * 0.9);
          rock.position.set(x, y + 0.15, z);
          this.decor.add(rock);
        } else {
          const bush = makeBush(rand, 0.8 + rand() * 0.6);
          bush.position.set(x, y, z);
          this.decor.add(bush);
        }
      }
    }
  }

  /** Sprinkle flowers and grass tufts over a rectangle of ground. */
  protected meadow(
    rand: () => number, minX: number, maxX: number, minZ: number, maxZ: number, y = 0,
    flowers = 26, tufts = 60, keepClear?: (x: number, z: number) => boolean,
  ): void {
    const spots = (n: number): number[][] => {
      const out: number[][] = [];
      let guard = 0;
      while (out.length < n && guard++ < n * 6) {
        const x = minX + rand() * (maxX - minX);
        const z = minZ + rand() * (maxZ - minZ);
        if (keepClear?.(x, z)) continue;
        out.push([x, y, z]);
      }
      return out;
    };
    this.group.add(makeFlowers(spots(flowers), rand));
    this.group.add(makeGrassTufts(spots(tufts), rand));
  }

  protected butterflies(count: number, minX: number, maxX: number, minZ: number, maxZ: number, rand: () => number): void {
    const box = new THREE.Box3(new THREE.Vector3(minX, 1.0, minZ), new THREE.Vector3(maxX, 2.6, maxZ));
    this.add(makeButterflies(count, box, rand));
  }

  /** A friendly bird sitting on a little post. */
  protected birdPost(x: number, z: number, y = 0, color?: number): Updatable {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.13, 1.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.9 }),
    );
    post.position.set(x, y + 0.8, z);
    post.castShadow = true;
    this.decor.add(post);
    const bird = makeBird(color);
    bird.position.set(x, y + 1.86, z);
    bird.rotation.y = Math.atan2(-x, 1);
    this.add(bird);
    return bird;
  }

  /** Call at the end of build(): merges static decor and attaches it. */
  protected finishDecor(): void {
    this.group.add(mergeStatic(this.decor));
    this.decor.clear();
  }
}
