import * as THREE from 'three';
import type { Affan, Emote } from '../character/Affan';
import type { AudioManager } from '../engine/Audio';
import { boxCollider, discCollider, type CharacterBody, type Collider, type PhysicsWorld } from '../engine/Physics';
import type { ChoiceQuestion } from '../edu/questions';
import { makeCheckpointFlag, makeCoin, makeStar, mat, shadow, type Sparkles, type Updatable, bakeColours } from '../env/builders';

/** Everything a stage may ask the game to do. Keeps stages independent of the game shell. */
export interface GameApi {
  scene: THREE.Scene;
  physics: PhysicsWorld;
  body: CharacterBody;
  affan: Affan;
  audio: AudioManager;
  sparkles: Sparkles;
  rand: () => number;
  addCoin(at: THREE.Vector3): void;
  addStar(at: THREE.Vector3): void;
  /** Affan fell in water, sand or off the world: lose a heart, return to the checkpoint. */
  fell(kind: 'water' | 'sand' | 'balls' | 'lava' | 'void'): void;
  setCheckpoint(x: number, y: number, z: number): void;
  praise(at?: THREE.Vector3): void;
  encourage(): void;
  say(text: string, opts?: { voice?: string; emote?: Emote; duration?: number }): void;
  /** Show the question panel; `voice` names the narration clip that reads it aloud. */
  /** `thenSfx` names a sound played right after the narration (e.g. the animal to identify). */
  showQuestion(prompt: string, detail?: string, voice?: string, thenSfx?: string): void;
  hideQuestion(): void;
  setTask(text: string | null): void;
  /** Big tappable answer buttons (also keys 1-3). Resolves once the right answer is chosen. */
  quiz(q: ChoiceQuestion): Promise<void>;
  /** Finish the stage. `line` replaces Affan's usual victory line; `delay` is how long before the results screen. */
  completeStage(opts?: { line?: { text: string; voice: string }; delay?: number }): void;
  /** A line spoken by another character: shown along the bottom of the screen and spoken if it has a voice clip. */
  caption(speaker: string, text: string, opts?: { voice?: string; duration?: number }): void;
  readonly camera: THREE.PerspectiveCamera;
  /** Blend sky, fog and light from the world's own look (k = 0) toward another theme (k = 1). */
  mood(to: WorldTheme, k: number): void;
  /** Take the camera for a scripted shot. The player cannot move until it ends. */
  cutscene(duration: number, camera: (t: number, out: { pos: THREE.Vector3; look: THREE.Vector3 }) => void, done?: () => void): void;
  /** True while a cutscene, quiz or respawn is running. */
  readonly busy: boolean;
}

export interface WorldTheme {
  sky: [number, number, number];
  fog: { color: number; near: number; far: number };
  sun: { color: number; intensity: number; dir: [number, number, number] };
  ambient: { sky: number; ground: number; intensity: number };
  music: string;
  ambience?: { name: string; volume: number };
  footstep: string;
}

export interface WorldDef {
  id: string;
  index: number;
  name: string;
  tagline: string;
  emoji: string;
  badge: { id: string; name: string; emoji: string };
  /** What Affan says when he first arrives in this world. */
  introLine?: { text: string; voice: string };
  theme: WorldTheme;
  stages: StageDef[];
  /** Worlds that are designed but not built yet show "coming soon". */
  available: boolean;
}

export interface StageDef {
  id: string;
  name: string;
  hint: string;
  create(game: GameApi): StageBase;
}

interface Pickup {
  obj: Updatable;
  kind: 'coin' | 'star';
  taken: boolean;
}

/** Something tall on or beside the path that fades whenever it comes between the camera and Affan. */
interface Veil {
  root: THREE.Object3D;
  mats: { material: THREE.Material; opacity: number; transparent: boolean; depthWrite: boolean }[];
  box: THREE.Box3 | null;
  /** 0 = solid, 1 = faded to a ghost. */
  k: number;
}

interface Checkpoint {
  x: number;
  y: number;
  z: number;
  radius: number;
  flag: Updatable | null;
  active: boolean;
}

export abstract class StageBase {
  readonly group = new THREE.Group();
  protected updatables: Updatable[] = [];
  protected colliders: Collider[] = [];
  protected pickups: Pickup[] = [];
  protected checkpoints: Checkpoint[] = [];
  private veils: Veil[] = [];
  private veilRay = new THREE.Ray();
  private veilA = new THREE.Vector3();
  private veilB = new THREE.Vector3();
  private veilHit = new THREE.Vector3();
  /** Platforms and obstacles that travel along a path; riders are carried by the physics. */
  protected movers: { mesh: THREE.Object3D; collider: Collider; path: (time: number) => [number, number, number]; meshDY: number }[] = [];
  /** Where Affan starts. */
  spawn = new THREE.Vector3(0, 0, 4);
  /** How far behind the spawn point Affan walks in from during the opening shots (must be clear ground). */
  introWalk = 2.2;
  /** Water surface height; falling below it triggers a splash. */
  waterLevel: number | null = null;
  /** What is down there: water splashes, sand swallows softly. */
  pitKind: 'water' | 'sand' | 'balls' | 'lava' = 'water';
  /** Anything below this is "fell off the world". */
  voidLevel = -12;
  /** Camera offset from Affan (behind and above). */
  cameraOffset = new THREE.Vector3(0, 4.1, 6.3);
  time = 0;
  protected finished = false;

  constructor(protected game: GameApi) {}

  /** Build scenery, colliders and gameplay. Called once. */
  abstract build(): void;

  /** Stage-specific per-frame logic. */
  protected abstract tick(dt: number): void;

  /** Called when Affan is put back at a checkpoint, so puzzles can reset. */
  onRespawn(): void {}

  /** Optional opening shots: camera position and look-at target over time (seconds). */
  intro(): { duration: number; camera(t: number, out: { pos: THREE.Vector3; look: THREE.Vector3 }): void } | null {
    return null;
  }

  // ---- Building helpers -------------------------------------------------------

  protected add<T extends THREE.Object3D>(o: T): T {
    this.group.add(o);
    const u = o as unknown as Updatable;
    if (u.userData.update) this.updatables.push(u);
    return o;
  }

  /**
   * Register something that could hide Affan from the camera: a wall across
   * the path, a sign, a tall card, a tree on the path. Whenever it stands
   * between the camera and Affan it fades to a faint ghost of itself, and
   * comes back when he is in view again, so the player never loses sight of
   * him or of what he is about to jump onto. `bake` first fuses its plain
   * parts into one mesh (do not use it for props whose parts change later).
   */
  protected veil<T extends THREE.Object3D>(root: T, bake = false): T {
    if (!root.parent) this.add(root);
    if (bake) bakeColours(root);
    const own = new Map<THREE.Material, THREE.Material>();
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      let copy = own.get(m.material);
      if (!copy) {
        copy = m.material.clone();
        own.set(m.material, copy);
      }
      m.material = copy;
    });
    this.veils.push({
      root, box: null, k: 0,
      mats: [...own.values()].map((material) => ({ material, opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite })),
    });
    return root;
  }

  /** True if the box stands on the straight line from `from` to `to`, clearly before reaching `to`. */
  private veilBlocks(box: THREE.Box3, from: THREE.Vector3, to: THREE.Vector3): boolean {
    const dir = this.veilRay.direction.copy(to).sub(from);
    const len = dir.length();
    dir.divideScalar(len);
    this.veilRay.origin.copy(from);
    const hit = this.veilRay.intersectBox(box, this.veilHit);
    return hit !== null && hit.distanceTo(from) < len - 0.45;
  }

  private tickVeils(dt: number): void {
    if (!this.veils.length) return;
    const cam = this.game.camera.position;
    const b = this.game.body;
    const head = this.veilA.set(b.x, b.y + 1.1, b.z);
    const feet = this.veilB.set(b.x, b.y + 0.25, b.z);
    for (const v of this.veils) {
      if (!v.box) {
        v.root.updateWorldMatrix(true, true);
        v.box = new THREE.Box3().setFromObject(v.root).expandByScalar(0.3);
      }
      const hide = v.box.containsPoint(cam) || this.veilBlocks(v.box, cam, head) || this.veilBlocks(v.box, cam, feet);
      const target = hide ? 1 : 0;
      if (v.k === target) continue;
      v.k += (target - v.k) * Math.min(1, dt * 10);
      if (Math.abs(target - v.k) < 0.02) v.k = target;
      const ghost = v.k > 0;
      for (const m of v.mats) {
        m.material.opacity = m.opacity * (1 - 0.86 * v.k);
        const transparent = ghost || m.transparent;
        if (m.material.transparent !== transparent) {
          m.material.transparent = transparent;
          // A solid material is drawn by a shader that ignores opacity; the renderer has to be told to switch.
          m.material.needsUpdate = true;
        }
        m.material.depthWrite = ghost ? false : m.depthWrite;
      }
    }
  }

  protected collide<T extends Collider>(c: T): T {
    this.colliders.push(c);
    this.game.physics.add(c);
    return c;
  }

  /** A block of land: grass on top, earth on the sides, with a collider. */
  protected ground(
    minX: number, maxX: number, minZ: number, maxZ: number, top = 0, depth = 3,
    topColor = 0x5fbf4a, sideColor = 0x8a5a33,
  ): Collider {
    const w = maxX - minX;
    const d = maxZ - minZ;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const earth = new THREE.Mesh(new THREE.BoxGeometry(w, depth, d), mat(sideColor, 0.95));
    earth.position.set(cx, top - depth / 2 - 0.12, cz);
    earth.receiveShadow = true;
    const grass = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, 0.24, d + 0.16), mat(topColor, 0.95));
    grass.position.set(cx, top - 0.12, cz);
    grass.receiveShadow = true;
    this.group.add(earth, grass);
    return this.collide(boxCollider(cx, cz, w / 2, d / 2, top, top - depth));
  }

  /** An invisible wall that keeps Affan inside the play area. */
  protected wall(minX: number, maxX: number, minZ: number, maxZ: number, top = 8, bottom = -4): Collider {
    return this.collide(
      boxCollider((minX + maxX) / 2, (minZ + maxZ) / 2, (maxX - minX) / 2, (maxZ - minZ) / 2, top, bottom, 'wall'),
    );
  }

  /** A solid cylinder (stump, pedestal, rock) with matching collider. */
  protected pillar(x: number, z: number, r: number, top: number, bottom: number, mesh: THREE.Object3D): Collider {
    mesh.position.set(x, top, z);
    this.add(mesh);
    return this.collide(discCollider(x, z, r, top, bottom));
  }

  /** A solid box prop (log, crate) with matching collider. Mesh is centred on the box. */
  protected block(x: number, z: number, hx: number, hz: number, top: number, bottom: number, color: number): Collider {
    const m = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, top - bottom, hz * 2), mat(color, 0.9));
    m.position.set(x, (top + bottom) / 2, z);
    shadow(m);
    this.group.add(m);
    return this.collide(boxCollider(x, z, hx, hz, top, bottom));
  }

  /**
   * Register something that moves. `path(time)` returns the collider's centre
   * x, top surface height and centre z; the mesh follows with an optional
   * vertical offset.
   */
  protected mover(mesh: THREE.Object3D, collider: Collider, path: (time: number) => [number, number, number], meshDY = 0): void {
    const [x, top, z] = path(0);
    const h = collider.top - collider.bottom;
    collider.x = x;
    collider.z = z;
    collider.top = top;
    collider.bottom = top - h;
    mesh.position.set(x, top + meshDY, z);
    this.group.add(mesh);
    this.collide(collider);
    this.movers.push({ mesh, collider, path, meshDY });
  }

  /** The checkpoint Affan would return to, or null if he has not reached one yet. */
  protected get activeCheckpoint(): { x: number; y: number; z: number } | null {
    return this.checkpoints.find((c) => c.active) ?? null;
  }

  protected coin(x: number, y: number, z: number): void {
    const c = makeCoin();
    c.position.set(x, y + 0.75, z);
    this.add(c);
    this.pickups.push({ obj: c, kind: 'coin', taken: false });
  }

  protected coinLine(x0: number, z0: number, x1: number, z1: number, n: number, y = 0): void {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      this.coin(x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t);
    }
  }

  protected star(x: number, y: number, z: number): void {
    const s = makeStar();
    s.position.set(x, y + 1.0, z);
    this.add(s);
    this.pickups.push({ obj: s, kind: 'star', taken: false });
  }

  protected checkpoint(x: number, y: number, z: number, radius = 2.2, withFlag = true, flagOffsetX = 2.4): void {
    let flag: Updatable | null = null;
    if (withFlag) {
      flag = makeCheckpointFlag();
      flag.position.set(x + flagOffsetX, y, z);
      this.add(flag);
    }
    this.checkpoints.push({ x, y, z, radius, flag, active: false });
  }

  // ---- Runtime ----------------------------------------------------------------

  update(dt: number): void {
    this.time += dt;
    this.tickVeils(dt);
    for (const u of this.updatables) u.userData.update!(dt, this.time);
    for (const m of this.movers) {
      const [x, top, z] = m.path(this.time);
      this.game.physics.moveTo(m.collider, x, top, z);
      m.mesh.position.set(x, top + m.meshDY, z);
    }

    const b = this.game.body;
    // Collectibles.
    for (const p of this.pickups) {
      if (p.taken) continue;
      const dx = p.obj.position.x - b.x;
      const dz = p.obj.position.z - b.z;
      const dy = p.obj.position.y - (b.y + 0.6);
      if (dx * dx + dz * dz < 0.75 * 0.75 && Math.abs(dy) < 1.1) {
        p.taken = true;
        p.obj.visible = false;
        if (p.kind === 'coin') this.game.addCoin(p.obj.position);
        else this.game.addStar(p.obj.position);
      }
    }
    // Checkpoints.
    for (const c of this.checkpoints) {
      if (c.active) continue;
      const dx = c.x - b.x;
      const dz = c.z - b.z;
      if (dx * dx + dz * dz < c.radius * c.radius && Math.abs(b.y - c.y) < 1.5 && b.grounded) {
        for (const o of this.checkpoints) {
          o.active = false;
          (o.flag?.userData as { setActive?: (v: boolean) => void } | undefined)?.setActive?.(false);
        }
        c.active = true;
        (c.flag?.userData as { setActive?: (v: boolean) => void } | undefined)?.setActive?.(true);
        this.game.setCheckpoint(c.x, c.y, c.z);
      }
    }
    // Falls.
    if (!this.game.busy) {
      if (this.waterLevel !== null && b.y < this.waterLevel - 0.25) this.game.fell(this.pitKind);
      else if (b.y < this.voidLevel) this.game.fell('void');
    }
    if (!this.finished) this.tick(dt);
  }

  dispose(): void {
    for (const c of this.colliders) this.game.physics.remove(c);
    this.colliders.length = 0;
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite) {
        m.geometry?.dispose();
      }
    });
  }
}
