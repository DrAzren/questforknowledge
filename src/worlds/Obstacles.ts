import * as THREE from 'three';
import { mergeInto } from '../env/builders';
import type { Collider } from '../engine/Physics';
import { StageBase } from './Stage';

export interface Gate {
  z: number;
  open(): void;
  readonly isOpen: boolean;
}

/**
 * Obstacles shared by several worlds: doors that slide away when a question is
 * answered, and "pushers" (boulders, beach balls, spinning beads) that travel
 * along a path and nudge Affan aside without ever hurting him. Each world
 * supplies its own look; the behaviour lives here.
 */
export abstract class ObstacleStage extends StageBase {
  /** Static scenery collected here is merged into a few meshes at the end of build(). */
  protected decor = new THREE.Group();
  /** Half-width of the walkable path. */
  protected readonly half = 6.4;

  private doors: { mesh: THREE.Object3D; collider: Collider; open: boolean; t: number; travel: number; baseY: number; baseX: number }[] = [];
  private pushers: { mesh: THREE.Object3D; collider: Collider; radius: number; lastX: number; lastZ: number; cooldown: number; roll: boolean; sound?: string }[] = [];

  /** Invisible walls along both sides of a stretch of path. */
  protected sideWalls(minZ: number, maxZ: number): void {
    this.wall(-this.half - 1.4, -this.half, minZ, maxZ);
    this.wall(this.half, this.half + 1.4, minZ, maxZ);
  }

  /** Register a door: when opened its collider switches off and the mesh sinks by `travel`. */
  protected door(mesh: THREE.Object3D, collider: Collider, z: number, travel: number, sound = 'stone_door'): Gate {
    const state = { mesh, collider, open: false, t: 0, travel, baseY: mesh.position.y, baseX: mesh.position.x };
    this.doors.push(state);
    const game = this.game;
    return {
      z,
      open(): void {
        if (state.open) return;
        state.open = true;
        collider.enabled = false;
        game.audio.sfx(sound);
      },
      get isOpen(): boolean {
        return state.open;
      },
    };
  }

  /**
   * Something round that travels along a path and pushes Affan out of its way.
   * `roll` spins the mesh like a rolling ball as it moves sideways.
   */
  protected pusher(
    mesh: THREE.Object3D, collider: Collider, radius: number,
    path: (time: number) => [number, number, number], meshDY: number, roll = true, sound?: string,
  ): void {
    this.mover(mesh, collider, path, meshDY);
    this.pushers.push({ mesh, collider, radius, lastX: collider.x, lastZ: collider.z, cooldown: 0, roll, sound });
  }

  protected finishDecor(): void {
    const merged = new THREE.Group();
    merged.add(...this.decor.children.slice());
    mergeInto(merged);
    merged.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.receiveShadow = true;
    });
    this.group.add(merged);
    this.decor.clear();
  }

  /** Doors sliding, pushers rolling and bumping. Call from tick(). */
  protected tickObstacles(dt: number): void {
    for (const d of this.doors) {
      if (d.open && d.t < 1) {
        d.t = Math.min(1, d.t + dt / 1.1);
        const e = d.t * d.t * (3 - 2 * d.t);
        d.mesh.position.y = d.baseY - e * d.travel;
        d.mesh.position.x = d.baseX + Math.sin(d.t * 60) * 0.02 * (1 - d.t);
      }
    }
    const b = this.game.body;
    for (const p of this.pushers) {
      const dx = p.collider.x - p.lastX;
      p.lastX = p.collider.x;
      p.lastZ = p.collider.z;
      if (p.roll) p.mesh.rotation.z -= dx / p.radius;
      p.cooldown = Math.max(0, p.cooldown - dt);
      const d = Math.hypot(b.x - p.collider.x, b.z - p.collider.z);
      if (p.cooldown === 0 && d < p.collider.r + b.cfg.radius + 0.06 && b.y < p.collider.top - 0.3 && !this.game.busy) {
        p.cooldown = 1.3;
        this.game.audio.sfx('bump');
        if (p.sound) this.game.audio.sfx(p.sound, { volume: 0.8 });
        this.game.affan.play('surprised', 0.6);
      }
    }
  }
}
