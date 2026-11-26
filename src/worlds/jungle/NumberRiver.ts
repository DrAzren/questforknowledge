import * as THREE from 'three';
import { spokenAdditionQuestion, type ChoiceQuestion } from '../../edu/questions';
import { discCollider, type Collider } from '../../engine/Physics';
import {
  makeCrocodile, makeGoalArch, makeRock, makeSign, makeStone, makeWater, makeWaterfall, mat, rng, shadow,
  type Updatable,
} from '../../env/builders';
import { JungleStage } from './JungleStage';

interface Stone {
  mesh: THREE.Group;
  collider: Collider;
  value: number;
  x: number;
  z: number;
  state: 'idle' | 'wobble' | 'sinking' | 'sunk' | 'correct';
  timer: number;
  phase: number;
}

interface Row {
  question: ChoiceQuestion<number>;
  stones: Stone[];
  solved: boolean;
  /** Affan can read this row's question while standing between these z values. */
  zoneMinZ: number;
  zoneMaxZ: number;
}

const WATER_Y = -0.55;
const ROW_Z = [-8.6, -16.6, -24.6];
const STONE_X = [-3, 0, 3];
const STONE_R = 1.0;

/**
 * Stage 1 - Sungai Nombor.
 * Three addition questions. Each is answered by jumping onto the stepping
 * stone showing the right number; wrong stones wobble as a warning and sink.
 */
export class NumberRiverStage extends JungleStage {
  private rows: Row[] = [];
  private crocs: { obj: Updatable; z: number; minX: number; maxX: number; dir: number; speed: number }[] = [];
  private activeRow = -1;
  private goalZ = -37;
  private crocSoundTimer = 4;

  build(): void {
    const rand = rng(1107);
    this.spawn.set(0, 0, 5);
    this.waterLevel = WATER_Y;

    // --- Land ---
    this.ground(-26, 26, -6, 26, 0);
    this.ground(-26, 26, -48, -27.2, 0);
    this.ground(-4.6, 4.6, -14.0, -11.2, 0, 2.4, 0x6cc755, 0x9a8f7a);
    this.ground(-4.6, 4.6, -22.0, -19.2, 0, 2.4, 0x6cc755, 0x9a8f7a);
    // Keep Affan on the path (the jungle beyond is scenery).
    this.wall(-11, -9.6, -6, 12);
    this.wall(9.6, 11, -6, 12);
    this.wall(-11, 11, 9.5, 11);
    this.wall(-11, -9.6, -48, -27.2);
    this.wall(9.6, 11, -48, -27.2);
    this.wall(-11, 11, -46, -44.5);

    // --- River ---
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(60, 24), mat(0x1f6f8f, 1));
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(0, -2.3, -16.6);
    this.group.add(bed);
    const water = makeWater(60, 21.6);
    water.position.set(0, WATER_Y, -16.6);
    this.add(water);

    // Waterfall on a cliff upstream (left), feeding the river.
    const cliff = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const rock = makeRock(rand, 4.2 + rand() * 1.6, i % 2 ? 0x7f8a8c : 0x6f7b7d);
      rock.position.set(-24 - rand() * 2.5, 1.5 + rand() * 2.4, -7 - i * 2.4);
      cliff.add(rock);
    }
    this.decor.add(cliff);
    const fall = makeWaterfall(7.5, 8.4);
    fall.position.set(-20.6, WATER_Y, -16.6);
    fall.rotation.y = Math.PI / 2;
    this.add(fall);

    // --- Question rows ---
    const zones: [number, number][] = [[-6, 2.5], [-14.2, -11], [-22.2, -19]];
    ROW_Z.forEach((z, r) => {
      const q = spokenAdditionQuestion(this.game.rand, r);
      const stones: Stone[] = q.options.map((value, i) => {
        const mesh = makeStone(STONE_R, String(value));
        mesh.position.set(STONE_X[i], 0, z);
        this.group.add(mesh);
        const collider = this.collide(discCollider(STONE_X[i], z, STONE_R, 0, -0.6, 'stone'));
        return { mesh, collider, value, x: STONE_X[i], z, state: 'idle', timer: 0, phase: rand() * 6 };
      });
      this.rows.push({ question: q, stones, solved: false, zoneMaxZ: zones[r][1], zoneMinZ: zones[r][0] });
    });

    // --- Crocodiles: friendly swimmers in the channels ---
    const lanes: [number, number, number][] = [[-10.4, -15, 15], [-18.4, -15, 15], [-26.0, -13, 13], [-7.2, 6, 16], [-21, -17, -7]];
    lanes.forEach(([z, minX, maxX], i) => {
      const croc = makeCrocodile();
      croc.scale.setScalar(0.78);
      croc.position.set(minX + rand() * (maxX - minX), WATER_Y - 0.1, z);
      const dir = i % 2 ? 1 : -1;
      croc.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.add(croc);
      this.crocs.push({ obj: croc, z, minX, maxX, dir, speed: 0.9 + rand() * 0.6 });
    });

    // --- Checkpoints, signs, rewards ---
    this.checkpoint(0, 0, 4, 3, false);
    this.checkpoint(0, 0, -12.6, 2.6, true, 3.6);
    this.checkpoint(0, 0, -20.6, 2.6, true, 3.6);
    this.checkpoint(0, 0, -29.5, 3, true, 4);

    const sign = makeSign('Sungai Nombor', 3.4);
    sign.position.set(-5.2, 0, 1.5);
    sign.rotation.y = 0.35;
    this.veil(shadow(sign), true);

    this.coinLine(-1.6, 2.5, 1.6, -3.5, 5);
    this.coin(-3, 0, -12.6);
    this.coin(3, 0, -12.6);
    this.coin(-3, 0, -20.6);
    this.coin(3, 0, -20.6);
    this.coinLine(0, -29.5, 0, -34, 4);

    const arch = makeGoalArch();
    arch.position.set(0, 0, this.goalZ);
    this.add(arch);

    // --- Jungle dressing ---
    this.jungleBorders(rand, -5, 22, 10.2, 22);
    this.jungleBorders(rand, -47, -28.5, 10.2, 22);
    // Trees behind the start and beyond the goal close off the view.
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      this.decorTree(rand, -10 + t * 20, 19.5 + rand() * 2);
      this.decorTree(rand, -9 + t * 18 + rand(), -45.6 - rand() * 1.5);
    }
    this.meadow(rand, -9, 9, -5.2, 9, 0, 34, 80, (x, z) => Math.abs(x) < 1.6 && z < 6);
    this.meadow(rand, -9, 9, -44, -28, 0, 30, 70, (x) => Math.abs(x) < 1.6);
    this.butterflies(7, -8, 8, -4, 8, rand);
    this.butterflies(5, -8, 8, -42, -29, rand);
    this.birdPost(-6.4, -30.5, 0);
    this.birdPost(7, 4, 0, 0xff8f3c);
    // River rocks and reeds along the banks.
    for (let i = 0; i < 16; i++) {
      const rock = makeRock(rand, 0.6 + rand() * 0.7, 0x8d9296);
      const far = i % 2 === 0;
      rock.position.set(-22 + rand() * 44, WATER_Y + 0.05, far ? -26.8 + rand() * 0.6 : -6.6 + rand() * 0.6);
      if (Math.abs(rock.position.x) < 5.5) rock.position.x += rock.position.x < 0 ? -6 : 6;
      this.decor.add(rock);
    }
    this.finishDecor();
  }

  private decorTree(rand: () => number, x: number, z: number): void {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 4.6, 9), mat(0x7a5230));
    trunk.position.y = 2.3;
    t.add(trunk);
    for (let i = 0; i < 4; i++) {
      const leaf = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.5 + rand() * 0.8, 1),
        mat([0x2f9e44, 0x37b24d, 0x2b8a3e][i % 3], 0.9, { flatShading: true }),
      );
      leaf.position.set((rand() - 0.5) * 2, 4.4 + rand() * 1.4, (rand() - 0.5) * 2);
      t.add(leaf);
    }
    t.position.set(x, 0, z);
    this.decor.add(shadow(t));
  }

  intro(): { duration: number; camera(t: number, out: { pos: THREE.Vector3; look: THREE.Vector3 }): void } {
    return {
      duration: 5.2,
      camera: (t, out) => {
        // Start wide over the river looking back at Affan, then glide in behind him.
        const k = Math.min(1, t / 5.2);
        const e = k * k * (3 - 2 * k);
        out.pos.set(9 - 9 * e, 6.5 - 1.1 * e, -9 + 22.6 * e);
        out.look.set(0, 1 + 0.3 * e, 6 - 4 * e);
      },
    };
  }

  protected tick(dt: number): void {
    const b = this.game.body;

    // Which question is Affan standing in front of?
    let active = -1;
    this.rows.forEach((row, i) => {
      if (!row.solved && b.z <= row.zoneMaxZ && b.z >= row.zoneMinZ - 3.9 && b.y > -0.3) active = i;
    });
    if (active !== this.activeRow) {
      this.activeRow = active;
      if (active >= 0) {
        const q = this.rows[active].question;
        this.game.showQuestion(q.prompt, q.detail, q.voice);
      } else {
        this.game.hideQuestion();
      }
    }

    for (const row of this.rows) {
      for (const s of row.stones) {
        // Gentle bobbing so the stones feel like they float.
        const bob = Math.sin(this.time * 1.6 + s.phase) * 0.025;
        const standing = b.grounded && b.ground === s.collider;
        switch (s.state) {
          case 'idle':
            s.mesh.position.y = bob;
            if (standing && !this.game.busy) {
              if (s.value === row.question.answer) {
                s.state = 'correct';
                row.solved = true;
                this.tint(s, 0x8ce99a);
                this.game.praise(new THREE.Vector3(s.x, 1.2, s.z));
                this.game.addStar(new THREE.Vector3(s.x, 1.4, s.z));
                // The other stones settle so nobody sinks after the question is answered.
              } else if (!row.solved) {
                s.state = 'wobble';
                s.timer = 0.75;
                this.tint(s, 0xffa8a8);
                this.game.audio.sfx('wrong');
                this.game.encourage();
                this.game.affan.play('surprised', 0.75);
              }
            }
            break;
          case 'wobble':
            // The warning: the stone rocks before it goes under.
            s.timer -= dt;
            s.mesh.rotation.z = Math.sin(this.time * 34) * 0.09;
            s.mesh.rotation.x = Math.cos(this.time * 29) * 0.07;
            s.mesh.position.y = bob - (0.75 - s.timer) * 0.12;
            if (s.timer <= 0) {
              s.state = 'sinking';
              s.timer = 0;
              s.collider.enabled = false;
              this.game.audio.sfx('stone_sink');
            }
            break;
          case 'sinking':
            s.timer += dt;
            s.mesh.position.y = -0.09 - s.timer * 1.6;
            s.mesh.rotation.z *= 0.9;
            s.mesh.rotation.x *= 0.9;
            if (s.timer > 1) {
              s.state = 'sunk';
              s.mesh.visible = false;
            }
            break;
          case 'correct':
            s.mesh.position.y = bob;
            break;
          default:
            break;
        }
      }
    }

    // Crocodiles paddle back and forth, turning smoothly at each end.
    for (const c of this.crocs) {
      c.obj.position.x += c.dir * c.speed * dt;
      if (c.obj.position.x > c.maxX) c.dir = -1;
      if (c.obj.position.x < c.minX) c.dir = 1;
      const targetYaw = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      c.obj.rotation.y += (targetYaw - c.obj.rotation.y) * Math.min(1, dt * 2.5);
      c.obj.position.y = WATER_Y - 0.1 + Math.sin(this.time * 1.4 + c.z) * 0.04;
    }
    this.crocSoundTimer -= dt;
    if (this.crocSoundTimer <= 0) {
      this.crocSoundTimer = 9 + this.game.rand() * 8;
      const near = this.crocs.some((c) => Math.hypot(c.obj.position.x - b.x, c.z - b.z) < 9);
      if (near) this.game.audio.sfx('croc', { volume: 0.5 });
    }

    // Waterfall gets louder as Affan gets close to the river.
    const riverDist = Math.max(0, Math.max(b.z - -6, -27.2 - b.z));
    void this.game.audio.loop('waterfall', Math.max(0.06, 0.4 - riverDist * 0.03));

    if (b.z < this.goalZ + 0.6 && b.grounded && !this.game.busy) {
      this.finished = true;
      this.game.hideQuestion();
      this.game.completeStage();
    }
  }

  private tint(s: Stone, color: number): void {
    // The stone's badge is the third child (stone, moss, badge, label).
    const badge = s.mesh.children[2] as THREE.Mesh;
    (badge.material as THREE.MeshBasicMaterial).color.setHex(color);
  }
}
