import * as THREE from 'three';
import { shuffle } from '../../edu/questions';
import { boxCollider, discCollider, type Collider } from '../../engine/Physics';
import { makeButterflies, makeGoalArch, makeSign, makeStone, makeWater, mat, rng, shadow } from '../../env/builders';
import { makeFlashCard, makeLilyPad, makePicketFence, makePodium, SCHOOL_COLORS } from '../../env/school';
import type { Gate } from '../Obstacles';
import { FLOOR_GRASS, SchoolStage } from './SchoolStage';

/** The animals, their Malay names, and the sound clip each one makes. */
export const ANIMALS: { id: string; emoji: string }[] = [
  { id: 'kucing', emoji: '🐱' },
  { id: 'anjing', emoji: '🐶' },
  { id: 'lembu', emoji: '🐮' },
  { id: 'itik', emoji: '🦆' },
  { id: 'ayam', emoji: '🐔' },
  { id: 'kambing', emoji: '🐐' },
];

interface Choice {
  animal: string;
  podium: THREE.Group;
  card: ReturnType<typeof makeFlashCard>;
  collider: Collider;
  x: number;
  z: number;
  state: 'idle' | 'wrong' | 'right';
}

interface Round {
  kind: 'name' | 'sound';
  target: string;
  choices: Choice[];
  gate: Gate;
  solved: boolean;
  zoneMinZ: number;
  zoneMaxZ: number;
}

const POD_X = [-3.7, 0, 3.7];
const POD_R = 1.1;
const POD_H = 0.5;
const WATER_Y = -0.55;

/**
 * World 3, stage 3 - Kenal Haiwan.
 * In the school garden, picture cards of animals stand behind podiums. First
 * Affan finds the animal that is named; then he listens and finds the animal
 * that makes the sound. Each right answer opens a garden gate.
 */
export class AnimalMatchStage extends SchoolStage {
  private rounds: Round[] = [];
  private active = -1;
  private goalZ = -64;
  private pending: { t: number; sfx: string }[] = [];

  build(): void {
    const rand = rng(9307);
    const g = this.game.rand;
    this.spawn.set(0, 0, 8);
    this.waterLevel = WATER_Y;

    this.floor(-12, 24, FLOOR_GRASS);
    this.floor(-80, -20, FLOOR_GRASS);
    this.sideWalls(-20, -12);
    this.wall(-8, 8, 11.6, 13);
    this.wall(-8, 8, -72, -70.6);

    // The garden pond: one stepping stone, then a drifting lily pad.
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(56, 8), mat(0x1f6f8f, 1));
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(0, -2, -16);
    this.group.add(bed);
    const water = makeWater(56, 8);
    water.position.set(0, WATER_Y, -16);
    this.add(water);
    const stone = makeStone(1.15);
    stone.position.set(0, 0, -14.05);
    this.group.add(stone);
    this.collide(discCollider(0, -14.05, 1.15, 0, -0.6));
    this.mover(makeLilyPad(1.35), discCollider(0, -17.5, 1.35, 0, -0.2, 'platform'), (t) => [Math.sin(t * 0.6) * 1.5, 0, -17.5]);

    // Beach balls rolling across the lawn.
    this.beachBall(-37.6, -5.2, 5.2, 7.2, 0.5);
    this.beachBall(-41.8, -5.2, 5.2, 6.2, 2.7);

    const targets = shuffle(g, ANIMALS).slice(0, 3);
    const kinds: Round['kind'][] = ['name', 'sound', 'sound'];
    const podZ = [-2, -27, -50];
    const gateZ = [-8, -33, -56];
    const zoneMax = [9, -20.5, -44.5];
    targets.forEach((target, r) => {
      const others = shuffle(g, ANIMALS.filter((a) => a.id !== target.id)).slice(0, 2);
      const set = shuffle(g, [target, ...others]);
      const tints = shuffle(g, SCHOOL_COLORS);
      const choices: Choice[] = set.map((a, i) => {
        const podium = makePodium(POD_R, POD_H, tints[i]);
        podium.position.set(POD_X[i], POD_H, podZ[r]);
        this.group.add(podium);
        const collider = this.collide(discCollider(POD_X[i], podZ[r], POD_R, POD_H, 0, 'podium'));
        const card = makeFlashCard(a.emoji);
        card.position.set(POD_X[i], 0, podZ[r] - 2.5);
        this.group.add(card);
        this.collide(boxCollider(POD_X[i], podZ[r] - 2.5, 1.2, 0.15, 4, 0));
        return { animal: a.id, podium, card, collider, x: POD_X[i], z: podZ[r], state: 'idle' };
      });
      this.rounds.push({
        kind: kinds[r], target: target.id, choices, gate: this.gardenGate(gateZ[r]), solved: false,
        zoneMinZ: gateZ[r], zoneMaxZ: zoneMax[r],
      });
    });

    this.checkpoint(0, 0, 7, 3, false);
    this.checkpoint(0, 0, -21.8, 1.8, true, 3.6);
    this.checkpoint(0, 0, -45.4, 2.2, true, 3.6);

    const sign = makeSign('Kenal Haiwan', 3.4);
    sign.position.set(-5, 0, 6.4);
    sign.rotation.y = 0.35;
    this.decor.add(sign);
    this.coinLine(0, 5.6, 0, 2.6, 3);
    this.coin(0, 0, -14.05);
    this.coin(0, 0, -17.5);
    this.coinLine(-3, -35.5, 3, -43.6, 5);
    this.coinLine(0, -58, 0, -62, 3);

    const arch = makeGoalArch();
    arch.position.set(0, 0, this.goalZ);
    this.add(arch);

    this.schoolBorders(rand, -11.6, 22, 'garden');
    this.schoolBorders(rand, -78, -20.4, 'garden');
    this.add(makeButterflies(7, new THREE.Box3(new THREE.Vector3(-6, 1, -10), new THREE.Vector3(6, 2.6, 8)), rand));
    this.add(makeButterflies(6, new THREE.Box3(new THREE.Vector3(-6, 1, -62), new THREE.Vector3(6, 2.6, -24)), rand));
    this.schoolyard(-100, [4.8, 9.4]);
    this.finishDecor();
  }

  /** A clipped hedge across the path with a white picket gate in the middle. */
  private gardenGate(z: number): Gate {
    const doorHalf = 1.7;
    for (const s of [-1, 1]) {
      const inner = doorHalf;
      const w = this.half + 5 - inner;
      const hedge = new THREE.Mesh(new THREE.BoxGeometry(w, 1.9, 1.1), mat(0x2f9e44, 0.95));
      hedge.position.set(s * (inner + w / 2), 0.95, z);
      this.decor.add(hedge);
      const topiary = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 10), mat(0x37b24d, 0.95));
      topiary.position.set(s * (inner + 0.5), 2.3, z);
      this.decor.add(topiary);
      this.collide(boxCollider(s * (inner + w / 2), z, w / 2, 0.55, 3.4, 0));
    }
    const picket = makePicketFence(doorHalf * 2 - 0.1, 1.9);
    picket.position.set(0, 0, z);
    shadow(picket);
    this.group.add(picket);
    const collider = this.collide(boxCollider(0, z, doorHalf, 0.3, 3.4, 0, 'door'));
    return this.door(picket, collider, z, 2.3, 'gate_chime');
  }

  intro(): { duration: number; camera(t: number, out: { pos: THREE.Vector3; look: THREE.Vector3 }): void } {
    return {
      duration: 4.2,
      camera: (t, out) => {
        const k = Math.min(1, t / 4.2);
        const e = k * k * (3 - 2 * k);
        // Start close on the three picture cards, then pull back to Affan.
        out.pos.set(0, 2.6 + 1.5 * e, 2.6 + 11.7 * e);
        out.look.set(0, 2.3 - 1.2 * e, -4.5 + 10.9 * e);
      },
    };
  }

  private ask(round: Round): void {
    if (round.kind === 'name') {
      this.game.showQuestion(`Cari ${round.target.toUpperCase()}`, undefined, `q_cari_${round.target}`);
    } else {
      this.game.showQuestion('Dengar! Haiwan apakah ini? 👂', undefined, 'q_bunyi', `animal_${round.target}`);
    }
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
      if (active >= 0) this.ask(this.rounds[active]);
      else this.game.hideQuestion();
    }

    for (let i = this.pending.length - 1; i >= 0; i--) {
      this.pending[i].t -= dt;
      if (this.pending[i].t <= 0) {
        this.game.audio.sfx(this.pending[i].sfx);
        this.pending.splice(i, 1);
      }
    }

    for (const round of this.rounds) {
      for (const c of round.choices) {
        if (c.state !== 'idle') continue;
        const on = b.grounded && b.ground === c.collider;
        if (!on || round.solved || this.game.busy) continue;
        const face = c.podium.userData.face as THREE.Mesh;
        const frame = c.card.userData.frame.material as THREE.MeshStandardMaterial;
        if (c.animal === round.target) {
          c.state = 'right';
          round.solved = true;
          (face.material as THREE.MeshBasicMaterial).color.setHex(0x8ce99a);
          frame.color.setHex(0x40c057);
          // Name every card now, so the picture, the word and the sound come together.
          for (const k of round.choices) k.card.userData.setLabel(k.animal.toUpperCase());
          this.game.praise(new THREE.Vector3(c.x, 1.6, c.z));
          this.game.addStar(new THREE.Vector3(c.x, 1.9, c.z));
          this.pending.push({ t: 1.5, sfx: `animal_${c.animal}` });
          round.gate.open();
        } else {
          c.state = 'wrong';
          (face.material as THREE.MeshBasicMaterial).color.setHex(0xffc9c9);
          frame.color.setHex(0xadb5bd);
          this.game.audio.sfx('wrong');
          this.game.encourage();
          this.game.affan.play('think', 1.1);
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
