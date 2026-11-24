import * as THREE from 'three';
import { numberSequenceQuestion } from '../../edu/questions';
import { boxCollider, discCollider, type Collider } from '../../engine/Physics';
import { makeGoalArch, makeSign, rng } from '../../env/builders';
import { makeBoulder } from '../../env/desert';
import { makeCrystals, makeLavaStone, ROCK_DARK } from '../../env/volcano';
import { VolcanoStage, type AnswerRock } from './VolcanoStage';

interface Stone {
  mesh: ReturnType<typeof makeLavaStone>;
  collider: Collider;
  z: number;
  number: number;
  rise: number;
  visited: boolean;
}

interface Round {
  question: ReturnType<typeof numberSequenceQuestion>;
  rocks: AnswerRock[];
  stones: Stone[];
  kerb: Collider;
  solved: boolean;
  solvedTime: number;
  zoneMinZ: number;
  zoneMaxZ: number;
}

const STONE_R = 0.85;
const STONE_GAP = 2.6;
const CHANNEL = 13.9;
/** Before they rise the stones float low in the lava, see-through: visibly not something to stand on. */
const SUNK_Y = -0.5;

/**
 * World 4, stage 3 - Puncak Gunung.
 * Five stepping stones cross each lava river, numbered in order with one
 * missing (1 2 3 ? 5). Hopping onto the rock with the missing number makes the
 * stones rise, and Affan crosses them in a counting hop-hop-hop.
 */
export class SummitSequenceStage extends VolcanoStage {
  private rounds: Round[] = [];
  private active = -1;
  private goalZ = -92;

  build(): void {
    const rand = rng(12307);
    const g = this.game.rand;
    this.spawn.set(0, 0, 8);

    const starts = [-6, -37.9, -69.8];
    this.rock(starts[0], 24);
    this.rock(starts[1], starts[0] - CHANNEL);
    this.rock(starts[2], starts[1] - CHANNEL);
    this.rock(-106, starts[2] - CHANNEL);
    for (const s of starts) this.lava(s - CHANNEL, s);
    this.wall(-8, 8, 11.6, 13);
    this.wall(-8, 8, -102, -100.6);

    const rockZ = [-0.6, -32.5, -64.4];
    const zoneMax = [9.5, -19.9, -51.8];
    const ranges: [number, number][] = [[1, 1], [2, 6], [10, 15]];
    starts.forEach((edge, r) => {
      const q = numberSequenceQuestion(g, ranges[r][0], ranges[r][1]);
      const stones: Stone[] = q.sequence.map((n, i) => {
        const z = edge - 1.75 - i * STONE_GAP;
        const mesh = makeLavaStone(STONE_R, i === q.missingIndex ? '?' : String(n));
        if (i === q.missingIndex) mesh.userData.setLabel('?', '#ffd43b');
        mesh.position.set(0, SUNK_Y, z);
        for (const m of mesh.userData.mats) m.opacity = 0.42;
        this.group.add(mesh);
        const collider = this.collide(discCollider(0, z, STONE_R, 0, -0.6, 'stone'));
        collider.enabled = false;
        return { mesh, collider, z, number: n, rise: 0, visited: false };
      });
      // Until the stones are up, the bank ends in an unseen kerb: nobody slips into the lava reaching for a stone that is not there yet.
      const kerb = this.collide(boxCollider(0, edge - 0.3, this.half, 0.25, 2.6, -1, 'kerb'));
      this.rounds.push({
        question: q, kerb,
        rocks: this.answerRocks(q.options, rockZ[r], 0, rand),
        stones, solved: false, solvedTime: 0,
        zoneMinZ: edge - 0.5, zoneMaxZ: zoneMax[r],
      });
    });

    // Hazards on the banks between the rivers.
    this.fallingRocks(-5, 5, -29, -22.5);
    const boulder = makeBoulder(0.8);
    boulder.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = new THREE.MeshStandardMaterial({ color: ROCK_DARK, roughness: 1, flatShading: true });
    });
    this.pusher(boulder, discCollider(0, -58.6, 0.74, 1.48, 0, 'boulder'), 0.8,
      (t) => [Math.sin((t / 7) * Math.PI * 2) * 5.2, 1.48, -58.6], -0.68);

    this.checkpoint(0, 0, 7, 3, false);
    this.checkpoint(0, 0, -21.5, 1.6, true, 3.4);
    this.checkpoint(0, 0, -53.4, 1.6, true, 3.4);
    this.checkpoint(0, 0, -85.3, 1.6, true, 3.4);

    const sign = makeSign('Puncak Gunung', 3.6);
    sign.position.set(-5, 0, 6.6);
    sign.rotation.y = 0.35;
    this.decor.add(sign);
    this.coinLine(0, 5.6, 0, 2.6, 3);
    this.coinLine(-3, -22, 3, -29, 4);
    this.coinLine(-3, -54.5, 3, -61, 4);
    this.coinLine(0, -86.5, 0, -90.5, 3);

    const arch = makeGoalArch();
    arch.position.set(0, 0, this.goalZ);
    this.add(arch);
    // The fire crystal at the summit.
    const fire = makeCrystals(rand, 0xff922b, 3.4, 8);
    fire.position.set(0, 0, -97.5);
    this.group.add(fire);
    this.collide(discCollider(0, -97.5, 1.7, 4, 0));

    this.volcanoBorders(rand, -104, 22);
    this.skyline(-140);
    this.finishDecor();
  }

  intro(): { duration: number; camera(t: number, out: { pos: THREE.Vector3; look: THREE.Vector3 }): void } {
    return {
      duration: 4.6,
      camera: (t, out) => {
        const k = Math.min(1, t / 4.6);
        const e = k * k * (3 - 2 * k);
        // Fly back along the first row of ghostly stones to Affan.
        out.pos.set(5 - 5 * e, 3.4 + 0.7 * e, -17 + 31.3 * e);
        out.look.set(0, 0.4 + 0.7 * e, -11 + 17.4 * e);
      },
    };
  }

  protected tick(dt: number): void {
    this.tickVolcano(dt);
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

    for (const round of this.rounds) {
      const hit = this.tickAnswerRocks(round.rocks, round.question.answer, !round.solved, dt);
      if (hit) {
        if (hit.result === 'right') {
          round.solved = true;
          round.solvedTime = 0;
          round.kerb.enabled = false;
          this.game.praise(new THREE.Vector3(hit.rock.x, 1.8, hit.rock.z));
          this.game.addStar(new THREE.Vector3(hit.rock.x, 2.1, hit.rock.z));
          this.game.audio.sfx('rock_rise');
          const missing = round.stones[round.question.missingIndex];
          missing.mesh.userData.setLabel(String(round.question.answer), '#8ce99a');
        } else {
          this.game.audio.sfx('wrong');
          this.game.encourage();
          this.game.affan.play('think', 1.1);
        }
      }
      if (round.solved) {
        round.solvedTime += dt;
        round.stones.forEach((s, i) => {
          // The stones surface one after another, in counting order.
          const k = Math.max(0, Math.min(1, (round.solvedTime - 0.2 - i * 0.22) / 0.35));
          if (k > 0 && !s.collider.enabled) s.collider.enabled = true;
          if (s.rise < 1) {
            s.rise = k;
            for (const m of s.mesh.userData.mats) {
              m.opacity = 0.42 + 0.58 * k;
              if (k >= 1) m.transparent = false;
            }
            s.mesh.position.y = SUNK_Y * (1 - k) + Math.sin(k * Math.PI) * 0.18;
          }
          // Each first landing chimes a step higher: a counting tune across the river.
          if (!s.visited && b.grounded && b.ground === s.collider) {
            s.visited = true;
            this.game.audio.sfx('coin', { rate: 0.8 + i * 0.12, minGap: 0 });
            this.game.sparkles.burst(new THREE.Vector3(0, 0.4, s.z), 10, [0xffd43b, 0xffa94d, 0xffffff], 2.5);
          }
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
