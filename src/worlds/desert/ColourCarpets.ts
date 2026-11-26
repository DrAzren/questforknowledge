import * as THREE from 'three';
import { shuffle } from '../../edu/questions';
import { boxCollider, type Collider } from '../../engine/Physics';
import { makeGoalArch, makeSign, mat, rng, type Updatable, shadow } from '../../env/builders';
import { CARPET_COLORS, CARPET_ICON, makeCarpet, makeColumn, SANDSTONE } from '../../env/desert';
import { DesertStage } from './DesertStage';

interface Carpet {
  colour: string;
  mesh: Updatable;
  collider: Collider;
  x: number;
  dockZ: number;
  farZ: number;
  state: 'docked' | 'boarding' | 'flying' | 'arrived' | 'wrong';
  timer: number;
  tried: boolean;
}

interface Round {
  target: string;
  carpets: Carpet[];
  solved: boolean;
  zoneMinZ: number;
  zoneMaxZ: number;
  /** z of the far ledge; Affan has crossed once he is beyond it. */
  farLedgeZ: number;
}

const COLOURS = Object.keys(CARPET_COLORS);
const CARPET_X = [-4.2, 0, 4.2];
const CARPET_TOP = 0.14;
const FLIGHT_SECONDS = 4.6;

/**
 * World 2, stage 2 - Permaidani Warna.
 * Three canyons. At each one three flying carpets wait; only the carpet of the
 * named colour flies Affan across. The others give a friendly wobble.
 */
export class ColourCarpetsStage extends DesertStage {
  private rounds: Round[] = [];
  private active = -1;
  private goalZ = -81;

  build(): void {
    const rand = rng(5209);
    const g = this.game.rand;
    this.spawn.set(0, 0, 8);
    this.cameraOffset.set(0, 4.6, 6.8);

    // Four ledges separated by three canyons.
    const ledges: [number, number][] = [[-2, 24], [-30, -16], [-58, -44], [-92, -72]];
    for (const [minZ, maxZ] of ledges) this.sand(minZ, maxZ);
    const canyons: [number, number][] = [[-16, -2], [-44, -30], [-72, -58]];
    for (const [minZ, maxZ] of canyons) this.quicksand(minZ, maxZ, 3.4);
    this.wall(-8, 8, 11.6, 13);
    this.wall(-8, 8, -88, -86.6);

    const targets = shuffle(g, COLOURS).slice(0, 3);
    canyons.forEach(([farEdge, nearEdge], r) => {
      const target = targets[r];
      const others = shuffle(g, COLOURS.filter((c) => c !== target)).slice(0, 2);
      const colours = shuffle(g, [target, ...others]);
      const dockZ = nearEdge - 1.2;
      const farZ = farEdge + 1.2;
      const carpets: Carpet[] = colours.map((colour, i) => {
        const mesh = makeCarpet(CARPET_COLORS[colour]);
        mesh.position.set(CARPET_X[i], CARPET_TOP, dockZ);
        this.add(mesh);
        const collider = this.collide(boxCollider(CARPET_X[i], dockZ, 1.4, 1.1, CARPET_TOP, CARPET_TOP - 0.14, 'carpet'));
        return { colour, mesh, collider, x: CARPET_X[i], dockZ, farZ, state: 'docked', timer: 0, tried: false };
      });
      // Coins hang over the canyon along each carpet's flight path.
      for (let i = 1; i <= 3; i++) {
        this.coin(CARPET_X[colours.indexOf(target)], CARPET_TOP + 0.1, dockZ + ((farZ - dockZ) * i) / 4);
      }
      this.rounds.push({
        target, carpets, solved: false,
        zoneMinZ: nearEdge - 2.6, zoneMaxZ: r === 0 ? 9 : ledges[r][1] + 0.5, farLedgeZ: farEdge,
      });
      // Mooring posts mark where the carpets wait.
      for (const x of [-6, -2.1, 2.1, 6]) {
        const post = makeColumn(1.2, 0.2);
        post.position.set(x, 0, nearEdge + 0.5);
        this.decor.add(post);
      }
    });

    // Obstacles on the ledges.
    this.boulder(-23, -5.2, 5.2, 7, 0.6);
    this.block(0, -51, 4.2, 0.4, 0.5, 0, SANDSTONE);
    for (const x of [-5.4, 5.4]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 0.8), mat(SANDSTONE, 0.95));
      cap.position.set(x, 0.8, -51);
      cap.castShadow = true;
      this.decor.add(cap);
      this.collide(boxCollider(x, -51, 1, 0.4, 1.6, 0));
    }

    this.checkpoint(0, 0, 7, 3, false);
    this.checkpoint(0, 0, -18.4, 2.4, true, 3.4);
    this.checkpoint(0, 0, -46.4, 2.4, true, 3.4);
    this.checkpoint(0, 0, -74.4, 2.4, true, 3.4);

    const sign = makeSign('Permaidani Warna', 4);
    sign.position.set(-5, 0, 6.2);
    sign.rotation.y = 0.35;
    this.veil(shadow(sign), true);
    this.coinLine(0, 5, 0, 1, 3);
    this.coinLine(-3, -19.5, 3, -27, 4);
    this.coinLine(-2.5, -47, 2.5, -55.5, 4);
    this.coinLine(0, -75, 0, -79, 3);

    const arch = makeGoalArch();
    arch.position.set(0, 0, this.goalZ);
    this.add(arch);

    for (const [minZ, maxZ] of ledges) this.desertBorders(rand, minZ + 1, Math.min(maxZ, 22) - 1);
    this.horizon(rand, -118);
    this.finishDecor();
  }

  intro(): { duration: number; camera(t: number, out: { pos: THREE.Vector3; look: THREE.Vector3 }): void } {
    return {
      duration: 4.4,
      camera: (t, out) => {
        const k = Math.min(1, t / 4.4);
        const e = k * k * (3 - 2 * k);
        // Sweep in from over the first canyon and its three carpets.
        out.pos.set(-8 + 8 * e, 5.2 - 0.6 * e, -12 + 26.8 * e);
        out.look.set(0, 0.6 + 0.5 * e, -3.2 + 9.6 * e);
      },
    };
  }

  /** After a fall, any carpet Affan has not finished crossing on goes back to wait for him. */
  onRespawn(): void {
    const cpZ = this.activeCheckpoint?.z ?? this.spawn.z;
    for (const round of this.rounds) {
      if (cpZ < round.farLedgeZ) continue;
      for (const c of round.carpets) {
        if (c.state === 'flying' || c.state === 'arrived' || c.state === 'boarding') {
          c.state = 'docked';
          c.timer = 0;
          this.place(c, c.dockZ, CARPET_TOP);
        }
      }
    }
  }

  private place(c: Carpet, z: number, top: number): void {
    this.game.physics.moveTo(c.collider, c.x, top, z);
    c.mesh.position.set(c.x, top, z);
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
        this.game.showQuestion(`Naik permaidani ${target.toUpperCase()} ${CARPET_ICON[target]}`, undefined, `q_naik_${target}`);
      } else {
        this.game.hideQuestion();
      }
    }

    for (const round of this.rounds) {
      for (const c of round.carpets) {
        const riding = b.grounded && b.ground === c.collider;
        const hover = Math.sin(this.time * 2 + c.x) * 0.03;
        switch (c.state) {
          case 'docked':
            c.mesh.position.y = CARPET_TOP + hover;
            if (riding && !this.game.busy) {
              if (c.colour === round.target) {
                c.state = 'boarding';
                c.timer = 0;
                if (!round.solved) {
                  round.solved = true;
                  this.game.praise(new THREE.Vector3(c.x, 1.4, c.dockZ));
                  this.game.addStar(new THREE.Vector3(c.x, 1.6, c.dockZ));
                }
              } else if (!c.tried) {
                c.state = 'wrong';
                c.timer = 0;
                c.tried = true;
                this.game.audio.sfx('wrong');
                this.game.encourage();
                this.game.affan.play('think', 1.1);
              }
            }
            break;
          case 'wrong': {
            // A wobble and a dip: this carpet is staying put. Then it fades a little.
            c.timer += dt;
            const k = Math.max(0, 1 - c.timer / 0.9);
            c.mesh.rotation.z = Math.sin(c.timer * 22) * 0.07 * k;
            c.mesh.position.y = CARPET_TOP - Math.sin(Math.min(1, c.timer / 0.9) * Math.PI) * 0.06;
            if (c.timer > 0.9) {
              c.mesh.rotation.z = 0;
              (c.mesh.userData.top as THREE.MeshStandardMaterial).color.setHex(0x9a9a9a);
              c.state = 'docked';
            }
            break;
          }
          case 'boarding':
            // A short pause so Affan is settled before take-off.
            c.timer += dt;
            if (!riding && c.timer > 0.2) {
              c.state = 'docked';
            } else if (c.timer > 0.45) {
              c.state = 'flying';
              c.timer = 0;
              this.game.audio.sfx('carpet');
            }
            break;
          case 'flying': {
            c.timer += dt;
            const k = Math.min(1, c.timer / FLIGHT_SECONDS);
            const e = k * k * (3 - 2 * k);
            const z = c.dockZ + (c.farZ - c.dockZ) * e;
            // Rises a little mid-flight, like a hop over the canyon.
            this.place(c, z, CARPET_TOP + Math.sin(k * Math.PI) * 0.5);
            c.mesh.rotation.x = -Math.sin(k * Math.PI * 2) * 0.05;
            if (k >= 1) {
              c.state = 'arrived';
              c.mesh.rotation.x = 0;
            }
            break;
          }
          case 'arrived':
            c.mesh.position.y = CARPET_TOP + hover;
            break;
          default:
            break;
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
