/**
 * Lightweight platformer physics: static/moving box and disc colliders plus a
 * kinematic character controller. Everything a preschool platformer needs
 * (ground, steps, walls, moving platforms, falling into water) without a
 * heavyweight physics engine, so it stays fast on phones.
 */

export interface Collider {
  kind: 'box' | 'disc';
  /** Centre in the XZ plane. */
  x: number;
  z: number;
  /** Half extents for boxes. */
  hx: number;
  hz: number;
  /** Radius for discs. */
  r: number;
  /** Top and bottom surface heights. */
  top: number;
  bottom: number;
  /** When false the collider is ignored (e.g. a stone that has sunk). */
  enabled: boolean;
  /** Movement applied this frame, carried over to whoever stands on it. */
  dx: number;
  dy: number;
  dz: number;
  tag?: string;
  data?: unknown;
}

export function boxCollider(
  x: number, z: number, hx: number, hz: number, top: number, bottom: number, tag?: string,
): Collider {
  return { kind: 'box', x, z, hx, hz, r: 0, top, bottom, enabled: true, dx: 0, dy: 0, dz: 0, tag };
}

export function discCollider(
  x: number, z: number, r: number, top: number, bottom: number, tag?: string,
): Collider {
  return { kind: 'disc', x, z, hx: r, hz: r, r, top, bottom, enabled: true, dx: 0, dy: 0, dz: 0, tag };
}

export class PhysicsWorld {
  colliders: Collider[] = [];

  add<T extends Collider>(c: T): T {
    this.colliders.push(c);
    return c;
  }

  remove(c: Collider): void {
    const i = this.colliders.indexOf(c);
    if (i >= 0) this.colliders.splice(i, 1);
  }

  clear(): void {
    this.colliders.length = 0;
  }

  /** Move a collider and remember the delta so riders are carried along. */
  moveTo(c: Collider, x: number, top: number, z: number): void {
    const height = c.top - c.bottom;
    c.dx = x - c.x;
    c.dz = z - c.z;
    c.dy = top - c.top;
    c.x = x;
    c.z = z;
    c.top = top;
    c.bottom = top - height;
  }

  /** Is the point (x,z) over the collider's top surface, with some margin? */
  static overlapsXZ(c: Collider, x: number, z: number, margin: number): boolean {
    if (c.kind === 'box') {
      return Math.abs(x - c.x) <= c.hx + margin && Math.abs(z - c.z) <= c.hz + margin;
    }
    const dx = x - c.x;
    const dz = z - c.z;
    const rr = c.r + margin;
    return dx * dx + dz * dz <= rr * rr;
  }
}

export interface CharacterConfig {
  radius: number;
  height: number;
  walkSpeed: number;
  runSpeed: number;
  jumpSpeed: number;
  gravity: number;
  /** Max ledge height the character walks up without jumping. */
  stepHeight: number;
  groundAccel: number;
  airAccel: number;
  /** Grace period after leaving a ledge during which a jump still works. */
  coyoteTime: number;
  /** A jump pressed slightly before landing is remembered this long. */
  jumpBuffer: number;
}

export const DEFAULT_CHARACTER: CharacterConfig = {
  radius: 0.32,
  height: 1.15,
  walkSpeed: 3.6,
  runSpeed: 6.0,
  jumpSpeed: 8.2,
  gravity: 22,
  stepHeight: 0.28,
  groundAccel: 40,
  airAccel: 18,
  coyoteTime: 0.12,
  jumpBuffer: 0.14,
};

export interface MoveInput {
  /** Desired direction in world space, length 0..1. */
  x: number;
  z: number;
  run: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
}

export interface StepEvents {
  jumped: boolean;
  landed: boolean;
  /** Downward speed at the moment of landing. */
  landSpeed: number;
}

export class CharacterBody {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  grounded = false;
  ground: Collider | null = null;
  /** Set false to freeze the body (cutscenes, quiz panels). */
  active = true;

  private coyote = 0;
  private buffer = 0;

  constructor(public world: PhysicsWorld, public cfg: CharacterConfig = DEFAULT_CHARACTER) {}

  teleport(x: number, y: number, z: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = this.vy = this.vz = 0;
    this.grounded = false;
    this.ground = null;
    this.coyote = 0;
    this.buffer = 0;
  }

  get horizontalSpeed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  step(dt: number, input: MoveInput): StepEvents {
    const ev: StepEvents = { jumped: false, landed: false, landSpeed: 0 };
    const cfg = this.cfg;
    if (!this.active) {
      this.vx = this.vz = 0;
      input = { x: 0, z: 0, run: false, jumpPressed: false, jumpHeld: false };
    }

    // Carry the rider with a moving platform.
    if (this.grounded && this.ground && this.ground.enabled) {
      this.x += this.ground.dx;
      this.z += this.ground.dz;
      this.y += this.ground.dy;
    }

    // Horizontal velocity eases toward the requested velocity.
    const speed = input.run ? cfg.runSpeed : cfg.walkSpeed;
    const tx = input.x * speed;
    const tz = input.z * speed;
    const accel = (this.grounded ? cfg.groundAccel : cfg.airAccel) * dt;
    const dvx = tx - this.vx;
    const dvz = tz - this.vz;
    const dv = Math.hypot(dvx, dvz);
    if (dv <= accel || dv === 0) {
      this.vx = tx;
      this.vz = tz;
    } else {
      this.vx += (dvx / dv) * accel;
      this.vz += (dvz / dv) * accel;
    }

    // Jumping with coyote time and an input buffer makes it forgiving for small hands.
    this.coyote = this.grounded ? cfg.coyoteTime : Math.max(0, this.coyote - dt);
    this.buffer = input.jumpPressed ? cfg.jumpBuffer : Math.max(0, this.buffer - dt);
    if (this.buffer > 0 && this.coyote > 0) {
      this.vy = cfg.jumpSpeed;
      this.grounded = false;
      this.ground = null;
      this.coyote = 0;
      this.buffer = 0;
      ev.jumped = true;
    }
    // Releasing jump early gives a shorter hop.
    if (!input.jumpHeld && this.vy > cfg.jumpSpeed * 0.45 && !this.grounded) {
      this.vy = cfg.jumpSpeed * 0.45;
    }

    this.vy -= cfg.gravity * dt;
    if (this.vy < -30) this.vy = -30;

    // --- Horizontal move, then push out of walls ---
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.resolveWalls();

    // --- Vertical move and ground detection ---
    const prevY = this.y;
    let newY = this.y + this.vy * dt;
    const wasGrounded = this.grounded;
    const fallSpeed = -this.vy;
    let best: Collider | null = null;
    if (this.vy <= 0) {
      // When walking, snap down small steps so slopes of stairs feel smooth.
      const snap = wasGrounded ? cfg.stepHeight : 0;
      for (const c of this.world.colliders) {
        if (!c.enabled) continue;
        if (!PhysicsWorld.overlapsXZ(c, this.x, this.z, cfg.radius * 0.35)) continue;
        if (c.top > prevY + cfg.stepHeight + 0.001) continue; // too high to step onto
        if (c.top < newY - snap - 0.001) continue; // still above it after this move
        if (!best || c.top > best.top) best = c;
      }
    }
    if (best) {
      newY = best.top;
      this.vy = 0;
      this.grounded = true;
      this.ground = best;
      if (!wasGrounded) {
        ev.landed = true;
        ev.landSpeed = fallSpeed;
      }
    } else {
      this.grounded = false;
      this.ground = null;
      // Bump head on ceilings.
      if (this.vy > 0) {
        for (const c of this.world.colliders) {
          if (!c.enabled) continue;
          if (!PhysicsWorld.overlapsXZ(c, this.x, this.z, cfg.radius * 0.5)) continue;
          const head = newY + cfg.height;
          if (prevY + cfg.height <= c.bottom + 0.001 && head > c.bottom) {
            newY = c.bottom - cfg.height;
            this.vy = 0;
          }
        }
      }
    }
    this.y = newY;
    return ev;
  }

  /** Push the character's circle out of any collider that is tall enough to be a wall. */
  private resolveWalls(): void {
    const cfg = this.cfg;
    const r = cfg.radius;
    for (const c of this.world.colliders) {
      if (!c.enabled) continue;
      // Surfaces we can step onto, or that are entirely above/below us, do not block.
      if (c.top <= this.y + cfg.stepHeight + 0.001) continue;
      if (c.bottom >= this.y + cfg.height) continue;
      if (c.kind === 'box') {
        const cx = Math.max(c.x - c.hx, Math.min(this.x, c.x + c.hx));
        const cz = Math.max(c.z - c.hz, Math.min(this.z, c.z + c.hz));
        let dx = this.x - cx;
        let dz = this.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = r - d;
          dx /= d;
          dz /= d;
          this.x += dx * push;
          this.z += dz * push;
          const vn = this.vx * dx + this.vz * dz;
          if (vn < 0) {
            this.vx -= vn * dx;
            this.vz -= vn * dz;
          }
        } else {
          // Centre is inside the box: leave through the nearest face.
          const left = this.x - (c.x - c.hx);
          const right = c.x + c.hx - this.x;
          const back = this.z - (c.z - c.hz);
          const front = c.z + c.hz - this.z;
          const m = Math.min(left, right, back, front);
          if (m === left) { this.x = c.x - c.hx - r; this.vx = Math.min(0, this.vx); }
          else if (m === right) { this.x = c.x + c.hx + r; this.vx = Math.max(0, this.vx); }
          else if (m === back) { this.z = c.z - c.hz - r; this.vz = Math.min(0, this.vz); }
          else { this.z = c.z + c.hz + r; this.vz = Math.max(0, this.vz); }
        }
      } else {
        let dx = this.x - c.x;
        let dz = this.z - c.z;
        const rr = r + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-4;
        dx /= d;
        dz /= d;
        this.x = c.x + dx * rr;
        this.z = c.z + dz * rr;
        const vn = this.vx * dx + this.vz * dz;
        if (vn < 0) {
          this.vx -= vn * dx;
          this.vz -= vn * dz;
        }
      }
    }
  }
}
