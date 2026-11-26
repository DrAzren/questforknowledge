import * as THREE from 'three';
import { spokenAdditionQuestion, type ChoiceQuestion } from '../../edu/questions';
import { makeGoalArch, makeSign, rng, shadow } from '../../env/builders';
import { makeBoulder } from '../../env/desert';
import { makeRockArch, ROCK_DARK } from '../../env/volcano';
import { discCollider } from '../../engine/Physics';
import { VolcanoStage, type AnswerRock } from './VolcanoStage';

interface Round {
  question: ChoiceQuestion<number>;
  rocks: AnswerRock[];
  bridge: { raise(): void; readonly raised: boolean };
  solved: boolean;
  zoneMinZ: number;
  zoneMaxZ: number;
}

/**
 * World 4, stage 1 - Jambatan Lava.
 * Three lava channels. Each has an addition question; hopping onto the rock
 * with the right answer makes a bridge of cooled rock rise out of the lava.
 * Between them: falling rocks, drifting rock platforms and a rolling boulder.
 */
export class LavaBridgesStage extends VolcanoStage {
  private rounds: Round[] = [];
  private active = -1;
  private goalZ = -77;

  build(): void {
    const rand = rng(10103);
    const g = this.game.rand;
    this.spawn.set(0, 0, 8);

    this.rock(-6, 24);
    this.lava(-12, -6);
    this.rock(-30, -12);
    this.lava(-36, -30);
    this.rock(-40.6, -36);
    this.lava(-49, -40.6);
    this.rock(-62, -49);
    this.lava(-68, -62);
    this.rock(-90, -68);
    this.wall(-8, 8, 11.6, 13);
    this.wall(-8, 8, -86, -84.6);

    // Rounds: addition, a little harder each time.
    const rockZ = [-0.6, -24.6, -56.6];
    const channels: [number, number][] = [[-12, -6], [-36, -30], [-68, -62]];
    const zoneMax = [9.5, -12, -49];
    [1, 2, 2].forEach((tier, r) => {
      let q = spokenAdditionQuestion(g, tier);
      // No two rounds ask the same sum.
      for (let tries = 0; tries < 8 && this.rounds.some((o) => o.question.voice === q.voice); tries++) q = spokenAdditionQuestion(g, tier);
      this.rounds.push({
        question: q,
        rocks: this.answerRocks(q.options, rockZ[r], 0, rand),
        bridge: this.rockBridge(channels[r][0], channels[r][1]),
        solved: false,
        zoneMinZ: channels[r][1] - 0.5,
        zoneMaxZ: zoneMax[r],
      });
    });

    // Between the first and second bridges: falling rocks.
    this.fallingRocks(-5, 5, -21, -14.5);
    // Third lava channel is crossed on drifting slabs of rock.
    this.rockPlatform(2.6, 0, (t) => [Math.sin(t * 0.7) * 2.2, 0, -42.9]);
    this.rockPlatform(2.6, 0, (t) => [Math.sin(t * 0.7 - 0.5) * 2.2, 0, -46.7]);
    // A boulder rolls back and forth before the last question.
    const boulder = makeBoulder(0.8);
    boulder.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = new THREE.MeshStandardMaterial({ color: ROCK_DARK, roughness: 1, flatShading: true });
    });
    this.pusher(boulder, discCollider(0, -52.4, 0.74, 1.48, 0, 'boulder'), 0.8,
      (t) => [Math.sin((t / 7) * Math.PI * 2) * 5.2, 1.48, -52.4], -0.68);

    this.checkpoint(0, 0, 7, 3, false);
    this.checkpoint(0, 0, -13.4, 1.6, true, 3.4);
    this.checkpoint(0, 0, -38.2, 1.8, true, 3.4);
    this.checkpoint(0, 0, -50.4, 1.6, true, 3.4);
    this.checkpoint(0, 0, -69.6, 1.8, true, 3.4);

    const sign = makeSign('Jambatan Lava', 3.6);
    sign.position.set(-5, 0, 6.6);
    sign.rotation.y = 0.35;
    this.veil(shadow(sign), true);
    this.coinLine(0, 5.6, 0, 2.6, 3);
    this.coinLine(0, -7, 0, -11, 3);
    this.coinLine(-3, -15, 3, -21, 4);
    this.coinLine(0, -31, 0, -35, 3);
    this.coin(0, 0, -42.9);
    this.coin(0, 0, -46.7);
    this.coinLine(0, -63, 0, -67, 3);
    this.coinLine(0, -71, 0, -75, 3);

    const arch = makeGoalArch();
    arch.position.set(0, 0, this.goalZ);
    this.add(arch);
    const cave = makeRockArch(7, 4.4);
    cave.position.set(0, 0, -82);
    this.decor.add(cave);

    this.volcanoBorders(rand, -88, 22);
    this.skyline(-125);
    this.finishDecor();
  }

  intro(): { duration: number; camera(t: number, out: { pos: THREE.Vector3; look: THREE.Vector3 }): void } {
    return {
      duration: 4.6,
      camera: (t, out) => {
        const k = Math.min(1, t / 4.6);
        const e = k * k * (3 - 2 * k);
        // Sweep over the first lava channel, then settle behind Affan.
        out.pos.set(8 - 8 * e, 5.5 - 1.4 * e, -12 + 26.3 * e);
        out.look.set(0, 0.8 + 0.3 * e, -6 + 12.4 * e);
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
      if (!hit) continue;
      if (hit.result === 'right') {
        round.solved = true;
        this.game.praise(new THREE.Vector3(hit.rock.x, 1.8, hit.rock.z));
        this.game.addStar(new THREE.Vector3(hit.rock.x, 2.1, hit.rock.z));
        round.bridge.raise();
      } else {
        this.game.audio.sfx('wrong');
        this.game.encourage();
        this.game.affan.play('think', 1.1);
      }
    }

    if (b.z < this.goalZ + 0.6 && b.grounded && !this.game.busy) {
      this.finished = true;
      this.game.hideQuestion();
      this.game.completeStage();
    }
  }
}
