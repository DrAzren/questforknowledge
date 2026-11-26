import * as THREE from 'three';
import { shuffle } from '../../edu/questions';
import { boxCollider, type Collider } from '../../engine/Physics';
import { makeGoalArch, makeSign, rng, shadow } from '../../env/builders';
import { makeLetterBlock, SCHOOL_COLORS } from '../../env/school';
import { SchoolStage, type Gate } from './SchoolStage';

/**
 * Capital letters with their small letter and two look-alikes. The look-alikes
 * are the ones children really confuse (b/d/p/q, m/n/w, a/e/o), which is where
 * the practice is worth having.
 */
export const LETTER_PAIRS: { upper: string; lower: string; lookalikes: [string, string] }[] = [
  { upper: 'A', lower: 'a', lookalikes: ['e', 'o'] },
  { upper: 'B', lower: 'b', lookalikes: ['d', 'p'] },
  { upper: 'D', lower: 'd', lookalikes: ['b', 'q'] },
  { upper: 'E', lower: 'e', lookalikes: ['a', 'c'] },
  { upper: 'G', lower: 'g', lookalikes: ['q', 'y'] },
  { upper: 'H', lower: 'h', lookalikes: ['n', 'b'] },
  { upper: 'M', lower: 'm', lookalikes: ['n', 'w'] },
  { upper: 'N', lower: 'n', lookalikes: ['m', 'h'] },
  { upper: 'Q', lower: 'q', lookalikes: ['p', 'g'] },
  { upper: 'R', lower: 'r', lookalikes: ['n', 't'] },
];

interface Block {
  letter: string;
  mesh: THREE.Group;
  collider: Collider;
  x: number;
  z: number;
  state: 'idle' | 'wrong' | 'right';
  timer: number;
}

interface Round {
  upper: string;
  lower: string;
  blocks: Block[];
  gate: Gate;
  solved: boolean;
  zoneMinZ: number;
  zoneMaxZ: number;
}

const BLOCK_X = [-3.7, 0, 3.7];
const BLOCK_SIZE = 1.8;
const BLOCK_H = 0.7;

/**
 * World 3, stage 1 - Huruf Besar dan Kecil.
 * A capital letter is chalked over each classroom door. Affan hops onto the
 * toy block with the matching small letter and the pencil gate slides away.
 */
export class LetterMatchStage extends SchoolStage {
  private rounds: Round[] = [];
  private active = -1;
  private goalZ = -66;

  build(): void {
    const rand = rng(7103);
    const g = this.game.rand;
    this.spawn.set(0, 0, 7);

    this.floor(-10, 24);
    this.ballPit(-18.4, -10, rand);
    this.floor(-43.6, -18.4);
    this.ballPit(-48.2, -43.6, rand);
    this.floor(-78, -48.2);
    this.wall(-8, 8, 10.6, 12);
    this.wall(-8, 8, -74, -72.6);

    // Ball pit 1: two storybooks drifting side to side, almost together.
    this.bookPlatform(2.6, SCHOOL_COLORS[0], (t) => [Math.sin(t * 0.7) * 2.2, 0, -12.3]);
    this.bookPlatform(2.6, SCHOOL_COLORS[1], (t) => [Math.sin(t * 0.7 - 0.5) * 2.2, 0, -16.1]);
    // Ball pit 2: one book shuttling across.
    this.bookPlatform(2.6, SCHOOL_COLORS[3], (t) => [0, 0, -45.9 - Math.sin(t * 0.7) * 1.0]);
    // Playground spinners between the second and third doors.
    this.spinner(-2.6, -36, 2.3, 7, 1);
    this.spinner(2.6, -40.4, 2.3, 7, -1);

    const picks = shuffle(g, LETTER_PAIRS).slice(0, 3);
    const gateZ = [-6, -30, -58];
    const blockZ = [-1.2, -25, -53];
    const zoneMax = [9, -19, -49];
    picks.forEach((pair, r) => {
      const letters = shuffle(g, [pair.lower, ...pair.lookalikes]);
      const tints = shuffle(g, SCHOOL_COLORS);
      const blocks: Block[] = letters.map((letter, i) => {
        const mesh = makeLetterBlock(letter, tints[i], BLOCK_SIZE, BLOCK_H);
        mesh.position.set(BLOCK_X[i], BLOCK_H, blockZ[r]);
        this.group.add(mesh);
        const collider = this.collide(boxCollider(BLOCK_X[i], blockZ[r], BLOCK_SIZE / 2, BLOCK_SIZE / 2, BLOCK_H, 0, 'block'));
        return { letter, mesh, collider, x: BLOCK_X[i], z: blockZ[r], state: 'idle', timer: 0 };
      });
      const { gate, board } = this.pencilGate(gateZ[r]);
      board.userData.setText(pair.upper);
      this.rounds.push({ upper: pair.upper, lower: pair.lower, blocks, gate, solved: false, zoneMinZ: gateZ[r], zoneMaxZ: zoneMax[r] });
    });

    this.checkpoint(0, 0, 6, 3, false);
    this.checkpoint(0, 0, -20.2, 2.4, true, 3.6);
    this.checkpoint(0, 0, -49.8, 2.2, true, 3.6);

    const sign = makeSign('Huruf Besar & Kecil', 4.2);
    sign.position.set(-4.9, 0, 5.4);
    sign.rotation.y = 0.35;
    this.veil(shadow(sign), true);

    this.coinLine(0, 4.5, 0, 1.5, 3);
    this.coinLine(-2, -7.6, 2, -9.2, 3);
    this.coin(0, 0, -12.3);
    this.coin(0, 0, -16.1);
    this.coinLine(-4.6, -33, 4.6, -42.5, 5);
    this.coin(0, 0, -45.9);
    this.coinLine(0, -60, 0, -64, 3);

    const arch = makeGoalArch();
    arch.position.set(0, 0, this.goalZ);
    this.add(arch);

    this.schoolBorders(rand, -9.6, 22, 'class');
    this.schoolBorders(rand, -43.2, -18.8, 'class');
    this.schoolBorders(rand, -76, -48.6, 'class');
    this.schoolyard(-98, [4.6, 9]);
    this.finishDecor();
  }

  intro(): { duration: number; camera(t: number, out: { pos: THREE.Vector3; look: THREE.Vector3 }): void } {
    return {
      duration: 4.6,
      camera: (t, out) => {
        const k = Math.min(1, t / 4.6);
        const e = k * k * (3 - 2 * k);
        // Start on the chalkboard over the first door, then settle behind Affan.
        out.pos.set(5 - 5 * e, 5.4 - 1.3 * e, 1 + 12.3 * e);
        out.look.set(0, 3.6 - 2.5 * e, -6 + 11.4 * e);
      },
    };
  }

  protected tick(dt: number): void {
    this.tickObstacles(dt);
    const b = this.game.body;

    let active = -1;
    this.rounds.forEach((round, i) => {
      if (!round.solved && b.z <= round.zoneMaxZ && b.z >= round.zoneMinZ) active = i;
    });
    if (active !== this.active) {
      this.active = active;
      if (active >= 0) {
        const round = this.rounds[active];
        this.game.showQuestion('Cari huruf kecil untuk:', round.upper, `q_huruf_${round.lower}`);
      } else {
        this.game.hideQuestion();
      }
    }

    for (const round of this.rounds) {
      for (const k of round.blocks) {
        const face = k.mesh.userData.face as THREE.Mesh;
        if (k.state === 'idle') {
          const on = b.grounded && b.ground === k.collider;
          if (on && !round.solved && !this.game.busy) {
            if (k.letter === round.lower) {
              k.state = 'right';
              round.solved = true;
              (face.material as THREE.MeshBasicMaterial).color.setHex(0x8ce99a);
              this.game.praise(new THREE.Vector3(k.x, 1.6, k.z));
              this.game.addStar(new THREE.Vector3(k.x, 1.9, k.z));
              round.gate.open();
            } else {
              k.state = 'wrong';
              k.timer = 0;
              (face.material as THREE.MeshBasicMaterial).color.setHex(0xffc9c9);
              this.game.audio.sfx('wrong');
              this.game.encourage();
              this.game.affan.play('think', 1.1);
            }
          }
        } else if (k.state === 'wrong') {
          // A little wobble "no", then the block greys so the others stand out.
          k.timer += dt;
          k.mesh.rotation.z = Math.sin(k.timer * 30) * 0.05 * Math.max(0, 1 - k.timer / 0.7);
          if (k.timer > 0.7 && k.timer < 5) {
            k.mesh.rotation.z = 0;
            (face.material as THREE.MeshBasicMaterial).color.setHex(0xd9d9d9);
            k.timer = 5;
          }
        }
      }
    }

    if (b.z < this.goalZ + 0.6 && b.grounded && !this.game.busy) {
      this.finished = true;
      this.game.hideQuestion();
      this.game.completeStage();
    }
  }
}
