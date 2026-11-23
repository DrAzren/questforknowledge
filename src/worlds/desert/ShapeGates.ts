import * as THREE from 'three';
import { shuffle } from '../../edu/questions';
import { discCollider, type Collider } from '../../engine/Physics';
import { makeGoalArch, makeSign, mat, rng } from '../../env/builders';
import {
  CARPET_COLORS, FLAT_SHAPE_ICON, FLAT_SHAPES, makeColumn, makeFlatShape, makePressurePlate, SANDSTONE_DARK, type FlatShape,
} from '../../env/desert';
import { DesertStage, type Gate } from './DesertStage';

interface Plate {
  shape: FlatShape;
  mesh: THREE.Group;
  collider: Collider;
  x: number;
  z: number;
  state: 'idle' | 'wrong' | 'right';
  timer: number;
}

interface Round {
  target: FlatShape;
  plates: Plate[];
  gate: Gate;
  solved: boolean;
  /** Affan sees this round's question between these z values. */
  zoneMinZ: number;
  zoneMaxZ: number;
}

const PLATE_R = 1.25;
/** Plates sit on low plinths, so choosing one takes a deliberate hop (nobody answers by walking past). */
const PLATE_H = 0.5;
const PLATE_X = [-3.7, 0, 3.7];
const COLORS = Object.values(CARPET_COLORS);

/**
 * World 2, stage 1 - Pintu Bentuk.
 * Three stone gates in the ruins. Each opens when Affan steps on the floor
 * plate showing the named shape. Between them: sliding sand platforms over
 * quicksand, rolling boulders and a shuttling stone bridge.
 */
export class ShapeGatesStage extends DesertStage {
  private rounds: Round[] = [];
  private active = -1;
  private goalZ = -66;

  build(): void {
    const rand = rng(4107);
    const g = this.game.rand;
    this.spawn.set(0, 0, 7);

    // Land, with two quicksand pits.
    this.sand(-10, 24);
    this.quicksand(-18.4, -10);
    this.sand(-43.6, -18.4);
    this.quicksand(-48.2, -43.6);
    this.sand(-78, -48.2);
    this.wall(-8, 8, 10.6, 12);
    this.wall(-8, 8, -74, -72.6);

    // Pit 1: two slabs drifting side to side, slowly and almost together, so small players can follow them.
    this.platform(2.6, 0, (t) => [Math.sin(t * 0.7) * 2.2, 0, -12.3]);
    this.platform(2.6, 0, (t) => [Math.sin(t * 0.7 - 0.5) * 2.2, 0, -16.1]);
    // Pit 2: a stone bridge that shuttles across.
    this.platform(2.6, 0, (t) => [0, 0, -45.9 - Math.sin(t * 0.7) * 1.0]);

    // Rolling boulders between the second and third gates.
    this.boulder(-35.4, -5.2, 5.2, 7.5, 0);
    this.boulder(-39.8, -5.2, 5.2, 6.3, 2.2);

    // Three gates, each asking for a different shape.
    const targets = shuffle(g, FLAT_SHAPES).slice(0, 3);
    const gateZ = [-6, -30, -58];
    const plateZ = [-1.2, -25, -53];
    const zoneMax = [9, -19, -49];
    targets.forEach((target, r) => {
      const others = shuffle(g, FLAT_SHAPES.filter((s) => s !== target)).slice(0, 2);
      const shapes = shuffle(g, [target, ...others]);
      const tints = shuffle(g, COLORS);
      const plates: Plate[] = shapes.map((shape, i) => {
        const mesh = makePressurePlate(shape, tints[i], PLATE_R);
        const plinth = new THREE.Mesh(new THREE.CylinderGeometry(PLATE_R * 1.02, PLATE_R * 1.12, PLATE_H, 28), mat(SANDSTONE_DARK, 0.95));
        plinth.position.y = -PLATE_H / 2;
        plinth.castShadow = true;
        plinth.receiveShadow = true;
        mesh.add(plinth);
        mesh.position.set(PLATE_X[i], PLATE_H, plateZ[r]);
        this.group.add(mesh);
        const collider = this.collide(discCollider(PLATE_X[i], plateZ[r], PLATE_R, PLATE_H + 0.12, 0, 'plate'));
        return { shape, mesh, collider, x: PLATE_X[i], z: plateZ[r], state: 'idle', timer: 0 };
      });
      // The door carries the outline of the shape that opens it.
      const emblem = makeFlatShape(target, 0xfff3bf, 1.5);
      emblem.rotation.x = 0;
      const gate = this.gate(gateZ[r], emblem);
      this.rounds.push({ target, plates, gate, solved: false, zoneMinZ: gateZ[r], zoneMaxZ: zoneMax[r] });
    });

    this.checkpoint(0, 0, 6, 3, false);
    this.checkpoint(0, 0, -20.2, 2.4, true, 3.6);
    this.checkpoint(0, 0, -49.8, 2.2, true, 3.6);

    const sign = makeSign('Pintu Bentuk', 3.4);
    sign.position.set(-4.9, 0, 5.2);
    sign.rotation.y = 0.35;
    this.decor.add(sign);

    this.coinLine(0, 4.5, 0, 1.5, 3);
    this.coinLine(-2, -7.6, 2, -9.2, 3);
    this.coin(0, 0, -12.3);
    this.coin(0, 0, -16.1);
    this.coinLine(-3, -32.5, 3, -42, 5);
    this.coin(0, 0, -45.9);
    this.coinLine(0, -60, 0, -64, 3);

    const arch = makeGoalArch();
    arch.position.set(0, 0, this.goalZ);
    this.add(arch);

    // Columns flank each gate; dunes, cacti and ruins line the path.
    for (const z of gateZ) {
      for (const s of [-1, 1]) {
        const col = makeColumn(3.6 + rand());
        col.position.set(s * 4.4, 0, z + 1.5);
        this.decor.add(col);
      }
    }
    this.desertBorders(rand, -76, 22, { ruins: true });
    this.horizon(rand, -100);
    this.finishDecor();
  }

  intro(): { duration: number; camera(t: number, out: { pos: THREE.Vector3; look: THREE.Vector3 }): void } {
    return {
      duration: 4.6,
      camera: (t, out) => {
        const k = Math.min(1, t / 4.6);
        const e = k * k * (3 - 2 * k);
        // Start high over the first gate, then settle behind Affan.
        out.pos.set(7 - 7 * e, 7 - 2.9 * e, -2 + 15.3 * e);
        out.look.set(0, 1.2, -6 + 11.4 * e);
      },
    };
  }

  protected tick(dt: number): void {
    this.tickDesert(dt);
    const b = this.game.body;

    let active = -1;
    this.rounds.forEach((round, i) => {
      if (!round.solved && b.z <= round.zoneMaxZ && b.z >= round.zoneMinZ) active = i;
    });
    if (active !== this.active) {
      this.active = active;
      if (active >= 0) {
        const target = this.rounds[active].target;
        this.game.showQuestion(
          `Lompat dan pijak bentuk ${target.toUpperCase()} ${FLAT_SHAPE_ICON[target]}`,
          undefined,
          `q_pijak_${target.replace(/ /g, '_')}`,
        );
      } else {
        this.game.hideQuestion();
      }
    }

    for (const round of this.rounds) {
      for (const p of round.plates) {
        const face = p.mesh.userData.face as THREE.Mesh;
        if (p.state === 'idle') {
          const on = b.grounded && b.ground === p.collider;
          if (on && !round.solved && !this.game.busy) {
            if (p.shape === round.target) {
              p.state = 'right';
              round.solved = true;
              (face.material as THREE.MeshBasicMaterial).color.setHex(0x8ce99a);
              this.game.praise(new THREE.Vector3(p.x, 1.2, p.z));
              this.game.addStar(new THREE.Vector3(p.x, 1.5, p.z));
              round.gate.open();
            } else {
              p.state = 'wrong';
              p.timer = 0;
              (face.material as THREE.MeshBasicMaterial).color.setHex(0xffc9c9);
              this.game.audio.sfx('wrong');
              this.game.encourage();
              this.game.affan.play('think', 1.1);
            }
          }
        } else if (p.state === 'wrong') {
          // A little shake of the head, then the plate fades so the others stand out.
          p.timer += dt;
          p.mesh.position.x = p.x + Math.sin(p.timer * 34) * 0.08 * Math.max(0, 1 - p.timer * 1.6);
          if (p.timer > 0.7) {
            p.mesh.position.x = p.x;
            const mark = p.mesh.userData.mark as THREE.Mesh;
            (mark.material as THREE.MeshBasicMaterial).color.setHex(0xbdbdbd);
            (face.material as THREE.MeshBasicMaterial).color.setHex(0xe9e4d8);
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
