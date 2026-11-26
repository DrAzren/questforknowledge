import * as THREE from 'three';
import { spokenSubtractionQuestion, type ChoiceQuestion } from '../../edu/questions';
import { discCollider, type Collider } from '../../engine/Physics';
import { makeGoalArch, makeSign, mat, rng, shadow } from '../../env/builders';
import { makeBoulder } from '../../env/desert';
import {
  CRYSTAL_COLORS, makeCountCrystal, makeCrystals, makeNumberRock, makeRockArch, ROCK_DARK,
} from '../../env/volcano';
import { VolcanoStage } from './VolcanoStage';

interface Lift {
  value: number;
  mesh: THREE.Group;
  steam: THREE.Mesh;
  collider: Collider;
  x: number;
  z: number;
  state: 'idle' | 'wrong' | 'sunk' | 'lift';
  timer: number;
  top: number;
  hissed: boolean;
}

interface Round {
  question: ChoiceQuestion<number> & { parts: [number, number] };
  lifts: Lift[];
  crystals: ReturnType<typeof makeCountCrystal>[];
  crossed: number;
  crossTimer: number;
  solved: boolean;
  base: number;
  cliffZ: number;
  zoneMaxZ: number;
}

const LIFT_R = 1.2;
const LIFT_DOWN = 0.5;
const STEP = 3;
const LIFT_X = [-3.6, 0, 3.6];
const CRYSTAL_GAP = 0.95;

/**
 * World 4, stage 2 - Gua Kristal.
 * The cave climbs in three tall steps. On each cliff a row of crystals shows a
 * subtraction (some are crossed out); the steam vent carrying the right answer
 * lifts Affan to the next level.
 */
export class CrystalCaveStage extends VolcanoStage {
  private rounds: Round[] = [];
  private active = -1;
  private goalZ = -68;

  build(): void {
    const rand = rng(11205);
    const g = this.game.rand;
    this.spawn.set(0, 0, 8);
    this.voidLevel = -20;

    const cliffs = [-9.2, -33.2, -57.2];
    this.rock(cliffs[0], 24, 0);
    this.rock(cliffs[1], cliffs[0], STEP, 7);
    this.rock(cliffs[2], cliffs[1], STEP * 2, 10);
    this.rock(-86, cliffs[2], STEP * 3, 13);
    this.wall(-8, 8, 11.6, 13, 30, -6);
    this.wall(-8, 8, -80, -78.6, 30, -6);

    [0, 1, 2].forEach((tier, r) => {
      const base = r * STEP;
      const cliffZ = cliffs[r];
      let q = spokenSubtractionQuestion(g, tier);
      for (let tries = 0; tries < 8 && q.answer === 0; tries++) q = spokenSubtractionQuestion(g, tier);
      const z = cliffZ + LIFT_R + 0.08;
      const lifts: Lift[] = q.options.map((value, i) => {
        const mesh = makeNumberRock(LIFT_R, 0.5, String(value), rand, CRYSTAL_COLORS[(i + r) % CRYSTAL_COLORS.length]);
        mesh.position.set(LIFT_X[i], base + LIFT_DOWN, z);
        this.group.add(mesh);
        // The column of steam that carries the right vent upward.
        const steam = new THREE.Mesh(
          new THREE.CylinderGeometry(LIFT_R * 0.7, LIFT_R * 0.95, 1, 12, 1, true),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }),
        );
        steam.position.set(LIFT_X[i], base, z);
        steam.visible = false;
        this.group.add(steam);
        const collider = this.collide(discCollider(LIFT_X[i], z, LIFT_R, base + LIFT_DOWN, base + LIFT_DOWN - 0.5, 'lift'));
        return { value, mesh, steam, collider, x: LIFT_X[i], z, state: 'idle', timer: 0, top: base + LIFT_DOWN, hissed: false };
      });

      // The subtraction as a picture: a crystals growing from a slab on the floor in front of
      // the vents (where the camera sees them under the question panel), the last b crossed out.
      const [a] = q.parts;
      const rowZ = cliffZ + 4.9;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(a * CRYSTAL_GAP + 0.7, 0.08, 1.3), mat(0x3d3340, 0.95));
      slab.position.set(0, base + 0.04, rowZ);
      slab.receiveShadow = true;
      this.group.add(slab);
      const crystals = Array.from({ length: a }, (_, i) => {
        const c = makeCountCrystal(CRYSTAL_COLORS[r % CRYSTAL_COLORS.length]);
        c.scale.setScalar(1.25);
        c.position.set((i - (a - 1) / 2) * CRYSTAL_GAP, base + 0.62, rowZ);
        this.group.add(c);
        return c;
      });
      this.rounds.push({
        question: q, lifts, crystals, crossed: 0, crossTimer: 0, solved: false, base, cliffZ,
        zoneMaxZ: r === 0 ? 9.5 : cliffs[r - 1] - 0.2,
      });
    });

    // Hazards on the way up.
    this.fallingRocks(-5, 5, -23, -13.5, STEP);
    const boulder = makeBoulder(0.8);
    boulder.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = new THREE.MeshStandardMaterial({ color: ROCK_DARK, roughness: 1, flatShading: true });
    });
    this.pusher(boulder, discCollider(0, -40.5, 0.74, STEP * 2 + 1.48, STEP * 2, 'boulder'), 0.8,
      (t) => [Math.sin((t / 7) * Math.PI * 2) * 5.2, STEP * 2 + 1.48, -40.5], -0.68);
    this.fallingRocks(-5, 5, -50.5, -44.5, STEP * 2, 2.0);

    this.checkpoint(0, 0, 7, 3, false);
    this.checkpoint(0, STEP, -11.6, 1.9, true, 3.6);
    this.checkpoint(0, STEP * 2, -35.6, 1.9, true, 3.6);
    this.checkpoint(0, STEP * 3, -59.6, 1.9, true, 3.6);

    const sign = makeSign('Gua Kristal', 3.2);
    sign.position.set(-5, 0, 6.6);
    sign.rotation.y = 0.35;
    this.veil(shadow(sign), true);
    this.coinLine(-4.5, 5.6, -4.5, 2.6, 3);
    this.coinLine(-3, -14, 3, -22, 4, STEP);
    this.coinLine(-3, -37, 3, -48, 5, STEP * 2);
    this.coinLine(0, -61, 0, -66, 4, STEP * 3);

    const arch = makeGoalArch();
    arch.position.set(0, STEP * 3, this.goalZ);
    this.add(arch);
    const heart = makeCrystals(rand, 0xff8fb1, 3.2, 7);
    heart.position.set(0, STEP * 3, -74.5);
    this.group.add(heart);
    this.collide(discCollider(0, -74.5, 1.6, STEP * 3 + 4, STEP * 3));

    // Cave mouths over the path, and crystals everywhere along the sides.
    [[14, 0], [-21, STEP], [-45.5, STEP * 2]].forEach(([z, y]) => {
      const cave = makeRockArch(15, 6.4);
      cave.position.set(0, y, z);
      // Not a shadow caster: the lintel would lay a dark band across the path that reads as a gap.
      cave.traverse((o) => { o.castShadow = false; });
      this.group.add(cave);
    });
    this.volcanoBorders(rand, cliffs[0], 22, 0);
    this.volcanoBorders(rand, cliffs[1], cliffs[0], STEP);
    this.volcanoBorders(rand, cliffs[2], cliffs[1], STEP * 2);
    this.volcanoBorders(rand, -84, cliffs[2], STEP * 3);
    this.skyline(-120, STEP * 3);
    this.finishDecor();
  }

  intro(): { duration: number; camera(t: number, out: { pos: THREE.Vector3; look: THREE.Vector3 }): void } {
    return {
      duration: 4.6,
      camera: (t, out) => {
        const k = Math.min(1, t / 4.6);
        const e = k * k * (3 - 2 * k);
        // Start on the crystals on the first cliff, then settle behind Affan.
        out.pos.set(3 - 3 * e, 3.2 + 0.9 * e, -1 + 15.3 * e);
        out.look.set(0, 2 - 0.9 * e, -9 + 15.4 * e);
      },
    };
  }

  protected tick(dt: number): void {
    this.tickVolcano(dt);
    const b = this.game.body;

    let active = -1;
    this.rounds.forEach((round, i) => {
      const onLevel = b.y > round.base - 0.4 && b.y < round.base + STEP - 0.2;
      if (!round.solved && onLevel && b.z <= round.zoneMaxZ && b.z >= round.cliffZ) active = i;
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

    for (let r = 0; r < this.rounds.length; r++) {
      const round = this.rounds[r];
      // Once Affan has had a moment with the question, the crystals being taken away are crossed out one by one.
      const [, takeAway] = round.question.parts;
      if ((r === this.active || round.solved) && round.crossed < takeAway) {
        round.crossTimer += dt;
        if (round.crossTimer > (round.crossed === 0 ? 1.4 : 0.4)) {
          round.crossTimer = 0;
          round.crossed++;
          round.crystals[round.crystals.length - round.crossed].userData.setCrossed(true);
          this.game.audio.sfx('coin', { volume: 0.35, rate: 0.6, minGap: 0 });
        }
      }

      for (const l of round.lifts) {
        const face = l.mesh.userData.face as THREE.Mesh;
        const riding = b.grounded && b.ground === l.collider;
        const down = round.base + LIFT_DOWN;
        const up = round.base + STEP;
        if (l.state === 'idle') {
          if (riding && !round.solved && !this.game.busy) {
            if (l.value === round.question.answer) {
              l.state = 'lift';
              round.solved = true;
              (face.material as THREE.MeshBasicMaterial).color.setHex(0x8ce99a);
              this.game.praise(new THREE.Vector3(l.x, round.base + 1.8, l.z));
              this.game.addStar(new THREE.Vector3(l.x, round.base + 2.1, l.z));
            } else {
              l.state = 'wrong';
              l.timer = 0;
              (face.material as THREE.MeshBasicMaterial).color.setHex(0xffc9c9);
              this.game.audio.sfx('wrong');
              this.game.encourage();
              this.game.affan.play('think', 1.1);
              this.game.sparkles.burst(new THREE.Vector3(l.x, round.base + 0.7, l.z), 14, [0xffffff, 0xe9ecef], 2.5);
            }
          }
        } else if (l.state === 'wrong') {
          // A weak puff of steam: this vent is not going anywhere. It settles to the floor.
          l.timer += dt;
          l.mesh.rotation.z = Math.sin(l.timer * 30) * 0.05 * Math.max(0, 1 - l.timer / 0.6);
          if (l.timer > 0.6) {
            l.top = Math.max(round.base + 0.12, down - (l.timer - 0.6) * 0.5);
            this.game.physics.moveTo(l.collider, l.x, l.top, l.z);
            l.mesh.position.y = l.top;
            if (l.top <= round.base + 0.12) {
              l.state = 'sunk';
              l.mesh.rotation.z = 0;
            }
          }
        } else if (l.state === 'lift') {
          // The vent rises while Affan stands on it, and comes back down for him if he drops to the lower level.
          const below = b.y < round.base + STEP - 0.6 && !riding && b.z > round.cliffZ;
          const target = riding ? up : below ? down : l.top > (down + up) / 2 ? up : down;
          if (Math.abs(target - l.top) > 0.001) {
            if (riding && target === up && !l.hissed) {
              l.hissed = true;
              this.game.audio.sfx('geyser');
            }
            const move = Math.sign(target - l.top) * Math.min(Math.abs(target - l.top), 1.25 * dt);
            l.top += move;
            this.game.physics.moveTo(l.collider, l.x, l.top, l.z);
            l.mesh.position.y = l.top;
          } else if (l.top === down) {
            l.hissed = false;
          }
          const h = l.top - round.base - 0.5;
          l.steam.visible = h > 0.08;
          l.steam.scale.set(1, Math.max(0.01, h), 1);
          l.steam.position.y = round.base + h / 2;
          (l.steam.material as THREE.MeshBasicMaterial).opacity = 0.32 + Math.sin(this.time * 14) * 0.08;
        }
      }
    }

    if (b.z < this.goalZ + 0.6 && b.y > STEP * 3 - 0.3 && b.grounded && !this.game.busy) {
      this.finished = true;
      this.game.hideQuestion();
      this.game.completeStage();
    }
  }
}
