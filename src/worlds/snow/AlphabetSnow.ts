import * as THREE from 'three';
import { firstLetterQuestion, lowercaseMatchQuestion, missingLetterQuestion } from '../../edu/questions';
import { makeGoalArch, makeSign, rng } from '../../env/builders';
import { makeIceCrystals, makeIgloo, makePolarBear } from '../../env/snow';
import { SnowStage, textOptions } from './SnowStage';

/**
 * World 5, stage 1 - Abjad Salji.
 * Three kinds of letter question in a row: the missing letter in a run, the
 * small letter for a capital, and the first letter of a snowy word. Each right
 * answer freezes a bridge across the icy water.
 */
export class AlphabetSnowStage extends SnowStage {
  private goalZ = -77;

  build(): void {
    const rand = rng(15101);
    const g = this.game.rand;
    this.spawn.set(0, 0, 8);

    this.snow(-6, 24);
    this.icyWater(-12, -6, rand);
    this.snow(-30, -12);
    this.icyWater(-36, -30, rand);
    this.snow(-40.6, -36);
    this.icyWater(-49, -40.6, rand);
    this.snow(-62, -49);
    this.icyWater(-68, -62, rand);
    this.snow(-90, -68);
    this.wall(-8, 8, 11.6, 13);
    this.wall(-8, 8, -86, -84.6);

    const q1 = missingLetterQuestion(g, 8);
    this.addRound({ prompt: q1.prompt, detail: q1.detail, voice: q1.voice, answer: q1.answer, options: textOptions(q1.options) }, -0.6, [-12, -6], 9.5);
    const q2 = lowercaseMatchQuestion(g);
    this.addRound({ prompt: q2.prompt, detail: q2.detail, voice: q2.voice, answer: q2.answer, options: textOptions(q2.options) }, -24.6, [-36, -30], -12);
    const q3 = firstLetterQuestion(g);
    this.addRound({ prompt: q3.prompt, detail: q3.detail, voice: q3.voice, answer: q3.answer, options: textOptions(q3.options) }, -56.6, [-68, -62], -49);

    // Penguins belly-slide across the path, one each way.
    this.penguinSlider(-15.6, 6.5, 0);
    this.penguinSlider(-19.6, 6.5, Math.PI);
    // The third channel is crossed on drifting ice.
    this.floe(2.8, (t) => [Math.sin(t * 0.7) * 2.2, 0, -42.9]);
    this.floe(2.8, (t) => [Math.sin(t * 0.7 - 0.5) * 2.2, 0, -46.7]);
    this.snowball(-52.4);

    this.checkpoint(0, 0, 7, 3, false);
    this.checkpoint(0, 0, -13.4, 1.6, true, 3.4);
    this.checkpoint(0, 0, -38.2, 1.8, true, 3.4);
    this.checkpoint(0, 0, -50.4, 1.6, true, 3.4);
    this.checkpoint(0, 0, -69.6, 1.8, true, 3.4);

    const sign = makeSign('Abjad Salji', 3.2);
    sign.position.set(-5, 0, 6.6);
    sign.rotation.y = 0.35;
    this.decor.add(sign);
    this.coinLine(0, 5.6, 0, 2.6, 3);
    this.coinLine(0, -7, 0, -11, 3);
    this.coinLine(-3, -13.6, 3, -13.6, 3);
    this.coinLine(0, -31, 0, -35, 3);
    this.coin(0, 0, -42.9);
    this.coin(0, 0, -46.7);
    this.coinLine(0, -63, 0, -67, 3);
    this.coinLine(0, -71, 0, -75, 3);

    const arch = makeGoalArch();
    arch.position.set(0, 0, this.goalZ);
    this.add(arch);

    // Friends along the way.
    const bear = makePolarBear();
    bear.position.set(-9.6, 0, 1.5);
    bear.rotation.y = 0.9;
    this.decor.add(bear);
    const igloo = makeIgloo(2);
    igloo.position.set(10.6, 0, -22);
    igloo.rotation.y = -0.9;
    this.decor.add(igloo);
    this.penguin(8.6, 0, -3.6, -1.0);
    this.penguin(9.5, 0, -2.6, -1.2);
    this.penguin(-8.6, 0, -27.4, 1.0);
    this.penguin(8.8, 0, -59, -1.1);
    this.penguin(-8.8, 0, -72, 0.9);
    const big = makeIceCrystals(rand, this.crystalMats[0], 3.2, 7);
    big.position.set(0, 0, -82.5);
    this.decor.add(big);

    this.snowBorders(rand, -88, 22);
    this.skyline(-125);
    this.startSnow();
    this.finishDecor();
  }

  intro(): { duration: number; camera(t: number, out: { pos: THREE.Vector3; look: THREE.Vector3 }): void } {
    return {
      duration: 4.6,
      camera: (t, out) => {
        const k = Math.min(1, t / 4.6);
        const e = k * k * (3 - 2 * k);
        // Sweep over the first icy channel, then settle behind Affan.
        out.pos.set(8 - 8 * e, 5.5 - 1.4 * e, -12 + 26.3 * e);
        out.look.set(0, 0.8 + 0.3 * e, -6 + 12.4 * e);
      },
    };
  }

  protected tick(dt: number): void {
    this.tickSnow(dt);
    this.tickRounds(dt);
    const b = this.game.body;
    if (b.z < this.goalZ + 0.6 && b.grounded && !this.game.busy) {
      this.finished = true;
      this.game.hideQuestion();
      this.game.completeStage();
    }
  }
}
