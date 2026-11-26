import * as THREE from 'three';
import { numberChoices, randInt, shuffle } from '../../edu/questions';
import { discCollider, type Collider } from '../../engine/Physics';
import { makeChest, makeSign, mat, rng, shadow, type Updatable, mergeInto } from '../../env/builders';
import { makeCactus, makeCamel, makeColumn, makeDrum, makeWallStar, SANDSTONE, SANDSTONE_DARK } from '../../env/desert';
import { DesertStage, type Gate } from './DesertStage';

interface Drum {
  value: number;
  mesh: THREE.Group;
  collider: Collider;
  x: number;
  z: number;
  state: 'idle' | 'wrong' | 'sunk' | 'right';
  timer: number;
}

interface Station {
  prompt: string;
  voice: string;
  answer: number;
  drums: Drum[];
  gate: Gate;
  solved: boolean;
  zoneMinZ: number;
  zoneMaxZ: number;
}

const DRUM_R = 1.0;
const DRUM_H = 0.6;
const DRUM_X = [-3.6, 0, 3.6];

/**
 * World 2, stage 3 - Kira di Gurun.
 * Count the camels, then the cacti, then the stars on the old wall. Each
 * answer is given by jumping onto the drum with the right number, which opens
 * the gate ahead. A treasure chest waits behind the last gate.
 */
export class DesertCountingStage extends DesertStage {
  private stations: Station[] = [];
  private active = -1;
  private chest!: Updatable;
  private chestOpen = false;
  private chestTimer = -1;
  private readonly chestPos = new THREE.Vector3(0, 0, -74);
  /** How many of each thing were actually placed in the scene (checked by the tests against the answers). */
  readonly placed = { camels: 0, cacti: 0, stars: 0 };

  build(): void {
    const rand = rng(6311);
    const g = this.game.rand;
    this.spawn.set(0, 0, 8);

    this.sand(-16, 24);
    this.quicksand(-24.4, -16);
    this.sand(-92, -24.4);
    this.wall(-8, 8, 11.6, 13);
    this.wall(-8, 8, -82, -80.6);

    this.platform(2.6, 0, (t) => [Math.sin(t * 0.7) * 2.2, 0, -18.3]);
    this.platform(2.6, 0, (t) => [Math.sin(t * 0.7 - 0.5) * 2.2, 0, -22.1]);
    this.boulder(-46.4, -5.2, 5.2, 7.2, 0.4);
    this.boulder(-50.6, -5.2, 5.2, 6.1, 2.6);

    // --- Station 1: camels in two pens beside the path ---
    const camels = randInt(g, 2, 5);
    const camelSlots: [number, number][] = [[-4.3, -6], [4.3, -6], [-4.3, -8.3], [4.3, -8.3], [-4.3, -10.4], [4.3, -10.4]];
    for (const [x, z] of shuffle(g, camelSlots).slice(0, camels)) {
      const camel = makeCamel();
      camel.position.set(x, 0, z);
      camel.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
      camel.scale.setScalar(0.92);
      this.add(camel);
      this.placed.camels++;
    }
    for (const s of [-1, 1]) {
      this.fence(s * 2.15, -8.2, 0.12, 3.5);
      this.fence(s * 4.3, -4.6, 2.15, 0.12);
    }
    this.station(0, `Kira unta 🐪. Ada berapa ekor?`, 'q_kira_unta', camels, -1.5, -12.6, 9, g);

    // --- Station 2: cacti in planters ---
    const cacti = randInt(g, 4, 7);
    const cactusSlots: [number, number][] = [
      [-5.4, -35.8], [-3.5, -35.8], [3.5, -35.8], [5.4, -35.8],
      [-5.4, -38.6], [-3.5, -38.6], [3.5, -38.6], [5.4, -38.6],
    ];
    for (const [x, z] of shuffle(g, cactusSlots).slice(0, cacti)) {
      const cactus = makeCactus(rand, 0.95);
      cactus.position.set(x, 0.3, z);
      // (A cactus fades if Affan walks behind it.)
      this.veil(shadow(cactus), true);
      this.placed.cacti++;
    }
    for (const s of [-1, 1]) {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.3, 5), mat(0xb98d57, 0.95));
      bed.position.set(s * 4.45, 0.15, -37.2);
      bed.receiveShadow = true;
      this.decor.add(bed);
      const soil = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 4.6), mat(0xf2d590, 1));
      soil.position.set(s * 4.45, 0.31, -37.2);
      this.decor.add(soil);
      this.collide({ kind: 'box', x: s * 4.45, z: -37.2, hx: 1.8, hz: 2.5, r: 0, top: 1.4, bottom: 0, enabled: true, dx: 0, dy: 0, dz: 0 });
    }
    this.station(1, `Kira kaktus 🌵. Ada berapa pokok?`, 'q_kira_kaktus', cacti, -31.5, -42, -25, g);

    // --- Station 3: stars set into the old wall around the last gate ---
    const stars = randInt(g, 6, 10);
    const starSlots: [number, number][] = [];
    for (const s of [-1, 1]) for (const x of [2.9, 4.3, 5.7]) for (const y of [1.55, 2.7]) starSlots.push([s * x, y]);
    const gateZ3 = -67;
    // (They fade together with the wall once Affan is through the gate.)
    const wallStars = new THREE.Group();
    for (const [x, y] of shuffle(g, starSlots).slice(0, stars)) {
      const star = makeWallStar(0.46);
      star.position.set(x, y, gateZ3 + 0.5);
      wallStars.add(star);
      this.placed.stars++;
    }
    mergeInto(wallStars);
    this.veil(wallStars);
    this.station(2, `Kira bintang ⭐. Ada berapa?`, 'q_kira_bintang', stars, -59, gateZ3, -53, g);

    // --- Treasure ---
    const dais = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.5, 0.24, 20), mat(SANDSTONE, 0.95));
    dais.position.set(0, 0.12, this.chestPos.z);
    dais.receiveShadow = true;
    this.group.add(dais);
    this.collide(discCollider(0, this.chestPos.z, 2.2, 0.24, 0));
    this.chest = makeChest();
    this.chest.position.set(0, 0.24, this.chestPos.z - 0.5);
    this.add(this.chest);
    this.collide({ kind: 'box', x: 0, z: this.chestPos.z - 0.5, hx: 0.75, hz: 0.5, r: 0, top: 1.0, bottom: 0.24, enabled: true, dx: 0, dy: 0, dz: 0 });
    for (const s of [-1, 1]) {
      const col = makeColumn(3.2);
      col.position.set(s * 3.4, 0, this.chestPos.z - 1.6);
      this.veil(shadow(col), true);
    }

    this.checkpoint(0, 0, 7, 3, false);
    this.checkpoint(0, 0, -26.2, 2.2, true, 3.6);
    this.checkpoint(0, 0, -54.2, 2.2, true, 3.6);

    const sign = makeSign('Kira di Gurun', 3.6);
    sign.position.set(-5, 0, 6.2);
    sign.rotation.y = 0.35;
    this.veil(shadow(sign), true);
    this.coinLine(0, 5.5, 0, 2.5, 3);
    this.coinLine(0, -5.5, 0, -10.5, 4);
    this.coin(0, 0, -18.3);
    this.coin(0, 0, -22.1);
    this.coinLine(0, -34, 0, -40, 4);
    this.coinLine(-3, -44, 3, -52.5, 5);
    this.coinLine(0, -68.5, 0, -71, 2);

    this.desertBorders(rand, -90, 22, { ruins: true, noCacti: true });
    this.horizon(rand, -112);
    this.finishDecor();
  }

  /** A low sandstone fence segment with a collider. */
  private fence(x: number, z: number, hx: number, hz: number): void {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, 0.7, hz * 2), mat(SANDSTONE_DARK, 0.95));
    rail.position.set(x, 0.35, z);
    shadow(rail);
    this.decor.add(rail);
    this.collide({ kind: 'box', x, z, hx, hz, r: 0, top: 1.6, bottom: 0, enabled: true, dx: 0, dy: 0, dz: 0 });
  }

  private station(
    index: number, prompt: string, voice: string, answer: number,
    drumZ: number, gateZ: number, zoneMaxZ: number, g: () => number,
  ): void {
    const values = numberChoices(g, answer, 3, 1, 20);
    const drums: Drum[] = values.map((value, i) => {
      const mesh = makeDrum(DRUM_R, DRUM_H, String(value));
      const collider = discCollider(DRUM_X[i], drumZ, DRUM_R, DRUM_H, 0, 'drum');
      mesh.position.set(DRUM_X[i], DRUM_H, drumZ);
      this.group.add(mesh);
      this.collide(collider);
      return { value, mesh, collider, x: DRUM_X[i], z: drumZ, state: 'idle', timer: 0 };
    });
    const gate = this.gate(gateZ);
    this.stations[index] = { prompt, voice, answer, drums, gate, solved: false, zoneMinZ: gateZ, zoneMaxZ };
  }

  intro(): { duration: number; camera(t: number, out: { pos: THREE.Vector3; look: THREE.Vector3 }): void } {
    return {
      duration: 4.4,
      camera: (t, out) => {
        const k = Math.min(1, t / 4.4);
        const e = k * k * (3 - 2 * k);
        // Glide past the camel pens back to Affan.
        out.pos.set(-7 + 7 * e, 3.2 + 0.9 * e, -3 + 17.3 * e);
        out.look.set(2 - 2 * e, 1.2, -8 + 14.4 * e);
      },
    };
  }

  protected tick(dt: number): void {
    this.tickDesert(dt);
    const b = this.game.body;

    let active = -1;
    this.stations.forEach((st, i) => {
      if (!st.solved && b.z <= st.zoneMaxZ && b.z >= st.zoneMinZ) active = i;
    });
    if (active !== this.active) {
      this.active = active;
      if (active >= 0) this.game.showQuestion(this.stations[active].prompt, undefined, this.stations[active].voice);
      else this.game.hideQuestion();
    }

    for (const st of this.stations) {
      for (const d of st.drums) {
        const face = d.mesh.userData.face as THREE.Mesh;
        const on = b.grounded && b.ground === d.collider;
        if (d.state === 'idle') {
          if (on && !st.solved && !this.game.busy) {
            if (d.value === st.answer) {
              d.state = 'right';
              st.solved = true;
              (face.material as THREE.MeshBasicMaterial).color.setHex(0x8ce99a);
              this.game.praise(new THREE.Vector3(d.x, 1.8, d.z));
              this.game.addStar(new THREE.Vector3(d.x, 2.1, d.z));
              st.gate.open();
            } else {
              d.state = 'wrong';
              d.timer = 0;
              (face.material as THREE.MeshBasicMaterial).color.setHex(0xffc9c9);
              this.game.audio.sfx('wrong');
              this.game.encourage();
              this.game.affan.play('think', 1.1);
            }
          }
        } else if (d.state === 'wrong') {
          // The drum shakes, then lowers gently to the sand with Affan on it.
          d.timer += dt;
          d.mesh.rotation.z = Math.sin(d.timer * 30) * 0.05 * Math.max(0, 1 - d.timer / 0.6);
          if (d.timer > 0.6) {
            const top = Math.max(0.12, DRUM_H - (d.timer - 0.6) * 0.5);
            this.game.physics.moveTo(d.collider, d.x, top, d.z);
            d.mesh.position.y = top;
            if (top <= 0.12) {
              d.state = 'sunk';
              d.mesh.rotation.z = 0;
            }
          }
        }
      }
    }

    // Treasure chest: opens when Affan walks up to it after the last gate.
    if (!this.chestOpen && this.stations[2].solved && !this.game.busy) {
      if (Math.hypot(b.x - this.chestPos.x, b.z - this.chestPos.z) < 3.1) {
        this.chestOpen = true;
        this.chestTimer = 1.4;
        (this.chest.userData as { open: () => void }).open();
        this.game.audio.sfx('achievement');
        this.game.sparkles.burst(new THREE.Vector3(0, 1.6, this.chestPos.z - 0.5), 70, [0xffd43b, 0xffe066, 0xfff3bf, 0xff922b], 6);
        this.game.hideQuestion();
        this.game.say('Wah, harta karun!', { emote: 'celebrate', duration: 1.4 });
      }
    }
    if (this.chestTimer > 0) {
      this.chestTimer -= dt;
      if (this.chestTimer <= 0) {
        this.finished = true;
        this.game.completeStage();
      }
    }
  }
}
