import * as THREE from 'three';
import { boxCollider, discCollider, type Collider } from '../../engine/Physics';
import { makeBush, makeFlowers, makeTree, mat, shadow, type Updatable } from '../../env/builders';
import {
  makeBallPitBalls, makeBeachBall, makeBlackboard, makeBookPlatform, makeBookshelf, makeHopscotch, makePencil,
  makePicketFence, makePoster, makeSchoolhouse, makeSpinnerPost, SCHOOL_COLORS,
} from '../../env/school';
import { ObstacleStage, type Gate } from '../Obstacles';
import type { WorldTheme } from '../Stage';

export type { Gate };

export const SCHOOL_THEME: WorldTheme = {
  sky: [0x4db5ff, 0xdff3ff, 0xbfe8a8],
  fog: { color: 0xe3f4ff, near: 44, far: 130 },
  sun: { color: 0xfff6dc, intensity: 2.7, dir: [-0.45, 1, 0.5] },
  ambient: { sky: 0xf4fbff, ground: 0xcfd9b0, intensity: 1.3 },
  music: 'school',
  ambience: { name: 'jungle_amb', volume: 0.12 },
  footstep: 'step_floor',
};

export const FLOOR_WOOD = 0xf0d6a4;
export const FLOOR_GRASS = 0x7fd066;
const WALL = 0xffe8cc;
const WALL_TRIM = 0xff922b;

/** Shared school building blocks: floors, ball pits, pencil gates, floating books, spinners, beach balls. */
export abstract class SchoolStage extends ObstacleStage {
  protected floor(minZ: number, maxZ: number, color = FLOOR_WOOD): void {
    this.ground(-28, 28, minZ, maxZ, 0, 4, color, 0xc9a56c);
    this.sideWalls(minZ, maxZ);
  }

  /** A pool of plastic balls. Falling in is soft and silly, costs a heart and returns Affan to the checkpoint. */
  protected ballPit(minZ: number, maxZ: number, rand: () => number, depth = 1.5): void {
    this.pitKind = 'balls';
    this.waterLevel = Math.max(this.waterLevel ?? -99, -depth + 0.45);
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(56, maxZ - minZ), mat(0x4263eb, 0.9));
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(0, -depth - 0.1, (minZ + maxZ) / 2);
    this.group.add(bed);
    this.group.add(makeBallPitBalls(-9, 9, minZ + 0.3, maxZ - 0.3, -depth + 0.1, rand));
    this.sideWalls(minZ, maxZ);
  }

  /** A big storybook that floats along a path as a platform. */
  protected bookPlatform(size: number, color: number, path: (time: number) => [number, number, number]): Collider {
    const c = boxCollider(0, 0, size / 2, size / 2, 0, -0.4, 'platform');
    this.mover(makeBookPlatform(size, color), c, path);
    return c;
  }

  /**
   * A school wall across the path whose doorway is barred by giant pencils.
   * The pencils sink into the floor when the gate opens. Returns the gate and
   * the blackboard mounted over the doorway.
   */
  protected pencilGate(z: number): { gate: Gate; board: ReturnType<typeof makeBlackboard> } {
    const doorHalf = 1.7;
    const height = 3.0;
    for (const s of [-1, 1]) {
      const inner = doorHalf;
      const outer = this.half + 5;
      const w = outer - inner;
      const wing = new THREE.Mesh(new THREE.BoxGeometry(w, height, 0.7), mat(WALL, 0.9));
      wing.position.set(s * (inner + w / 2), height / 2, z);
      this.decor.add(wing);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, 0.76), mat(WALL_TRIM, 0.8));
      trim.position.set(s * (inner + w / 2), height + 0.15, z);
      this.decor.add(trim);
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, 0.76), mat(0x4dabf7, 0.8));
      skirt.position.set(s * (inner + w / 2), 0.2, z);
      this.decor.add(skirt);
      this.collide(boxCollider(s * (inner + w / 2), z, w / 2, 0.38, height + 0.3, 0));
      const poster = makePoster(s < 0 ? 'abc' : '123', 1.5);
      poster.position.set(s * (inner + 2.4), 1.75, z + 0.36);
      this.group.add(poster);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorHalf * 2 + 0.2, 0.5, 0.8), mat(WALL_TRIM, 0.8));
    lintel.position.set(0, height + 0.05, z);
    this.decor.add(lintel);
    this.collide(boxCollider(0, z, doorHalf, 0.4, height + 0.3, height - 0.2));
    const board = makeBlackboard(3.0, 1.7);
    board.position.set(0, height + 1.25, z + 0.1);
    this.group.add(board);

    const pencils = new THREE.Group();
    const n = 6;
    for (let i = 0; i < n; i++) {
      const p = makePencil(height - 0.25, SCHOOL_COLORS[i % SCHOOL_COLORS.length], 0.27);
      p.position.x = (i / (n - 1) - 0.5) * (doorHalf * 2 - 0.6);
      pencils.add(p);
    }
    pencils.position.set(0, 0, z);
    shadow(pencils);
    this.group.add(pencils);
    const collider = this.collide(boxCollider(0, z, doorHalf, 0.3, height, 0, 'door'));
    return { gate: this.door(pencils, collider, z, height + 0.2, 'gate_chime'), board };
  }

  /**
   * A playground spinner: a post with a bar that turns, a big bead on each end.
   * The beads push Affan aside; step through when the bar swings clear.
   */
  protected spinner(x: number, z: number, armRadius: number, period: number, direction = 1): void {
    const post = makeSpinnerPost(armRadius);
    post.position.set(x, 0, z);
    this.group.add(post);
    this.collide(discCollider(x, z, 0.5, 1.6, 0));
    const angle = (time: number): number => direction * (time / period) * Math.PI * 2;
    const arm = post.userData.arm;
    (post as Updatable).userData.update = (_dt, time) => {
      arm.rotation.y = -angle(time);
    };
    this.updatables.push(post);
    for (const side of [0, Math.PI]) {
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), mat(side ? 0x69db7c : 0xda77f2, 0.5));
      bead.castShadow = true;
      const c = discCollider(0, 0, 0.6, 1.36, 0.1, 'spinner');
      this.pusher(bead, c, 0.62, (time) => {
        const a = angle(time) + side;
        return [x + Math.cos(a) * armRadius, 1.36, z + Math.sin(a) * armRadius];
      }, -0.64, false);
    }
  }

  /** A beach ball that rolls from side to side and bumps Affan gently out of the way. */
  protected beachBall(z: number, minX: number, maxX: number, period: number, phase = 0, radius = 0.8): void {
    const mesh = makeBeachBall(radius);
    const c = discCollider(0, z, radius * 0.92, radius * 1.85, 0, 'ball');
    const mid = (minX + maxX) / 2;
    const amp = (maxX - minX) / 2;
    this.pusher(mesh, c, radius, (time) => [mid + Math.sin((time / period) * Math.PI * 2 + phase) * amp, radius * 1.85, z], -radius * 0.85);
  }

  /** Classroom or library walls, shelves and boards along both sides; or a garden with fences and trees. */
  protected schoolBorders(rand: () => number, minZ: number, maxZ: number, style: 'class' | 'library' | 'garden'): void {
    const inner = this.half + 2.4;
    const len = maxZ - minZ;
    for (const side of [-1, 1]) {
      if (style === 'garden') {
        for (let z = minZ + 2; z < maxZ; z += 4.1) {
          const fence = makePicketFence(4);
          fence.position.set(side * (inner - 0.6), 0, z);
          fence.rotation.y = Math.PI / 2;
          this.decor.add(fence);
        }
        for (let i = 0; i < len / 5.5; i++) {
          const tree = makeTree(rand, 0.8 + rand() * 0.4);
          tree.position.set(side * (inner + 2.5 + rand() * 8), 0, minZ + rand() * len);
          this.decor.add(tree);
          const bush = makeBush(rand, 0.8 + rand() * 0.5);
          bush.position.set(side * (inner + 0.6 + rand() * 3), 0, minZ + rand() * len);
          this.decor.add(bush);
        }
        const spots: number[][] = [];
        for (let i = 0; i < len * 0.9; i++) spots.push([side * (this.half + 1.9 + rand() * 6), 0, minZ + rand() * len]);
        this.group.add(makeFlowers(spots, rand));
        continue;
      }
      // Indoors: a long wall with shelves, boards and posters in front of it.
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.6, 5.2, len), mat(style === 'library' ? 0xe5dbff : WALL, 0.9));
      wall.position.set(side * (inner + 3.4), 2.6, (minZ + maxZ) / 2);
      this.decor.add(wall);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.5, len), mat(style === 'library' ? 0x7048e8 : 0x4dabf7, 0.8));
      stripe.position.set(side * (inner + 3.4), 0.25, (minZ + maxZ) / 2);
      this.decor.add(stripe);
      let k = 0;
      for (let z = minZ + 2.4; z < maxZ - 1.5; z += style === 'library' ? 4.4 : 5.2, k++) {
        if (style === 'library' || k % 3 === 0) {
          const shelf = makeBookshelf(rand, 3.6, style === 'library' ? 4.2 : 2.9);
          shelf.position.set(side * (inner + 2.7), 0, z);
          shelf.rotation.y = side * -Math.PI / 2;
          this.decor.add(shelf);
        } else if (k % 3 === 1) {
          const board = makeBlackboard(3.2, 1.9, ['A B C', '1 2 3', 'a b c', '+  −'][Math.floor(rand() * 4)]);
          board.position.set(side * (inner + 3.0), 2.5, z);
          board.rotation.y = side * -Math.PI / 2;
          this.group.add(board);
        } else {
          const poster = makePoster((['abc', '123', 'shapes'] as const)[Math.floor(rand() * 3)], 1.9);
          poster.position.set(side * (inner + 3.05), 2.5, z);
          poster.rotation.y = side * -Math.PI / 2;
          this.group.add(poster);
        }
      }
    }
  }

  /** The schoolhouse on the skyline, and a hopscotch court by the start. */
  protected schoolyard(farZ: number, hopscotchAt?: [number, number]): void {
    const school = makeSchoolhouse(22);
    school.position.set(0, 0, farZ);
    this.decor.add(school);
    if (hopscotchAt) {
      const hop = makeHopscotch();
      hop.position.set(hopscotchAt[0], 0, hopscotchAt[1]);
      this.group.add(hop);
    }
  }
}
