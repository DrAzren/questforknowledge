import { describe, expect, it } from 'vitest';
import { boxCollider, CharacterBody, DEFAULT_CHARACTER, discCollider, PhysicsWorld, type MoveInput } from '../src/engine/Physics';

const DT = 1 / 120;
const idle: MoveInput = { x: 0, z: 0, run: false, jumpPressed: false, jumpHeld: false };

function setup(): { world: PhysicsWorld; body: CharacterBody } {
  const world = new PhysicsWorld();
  world.add(boxCollider(0, 0, 10, 10, 0, -3));
  const body = new CharacterBody(world);
  body.teleport(0, 0.5, 0);
  for (let i = 0; i < 120; i++) body.step(DT, idle);
  return { world, body };
}

describe('character controller', () => {
  it('falls and lands on the ground', () => {
    const { body } = setup();
    expect(body.grounded).toBe(true);
    expect(body.y).toBeCloseTo(0, 5);
  });

  it('jumps to a consistent height and lands again', () => {
    const { body } = setup();
    let peak = 0;
    let landed = false;
    body.step(DT, { ...idle, jumpPressed: true, jumpHeld: true });
    for (let i = 0; i < 240; i++) {
      const ev = body.step(DT, { ...idle, jumpHeld: true });
      peak = Math.max(peak, body.y);
      if (ev.landed) landed = true;
    }
    const expected = DEFAULT_CHARACTER.jumpSpeed ** 2 / (2 * DEFAULT_CHARACTER.gravity);
    expect(peak).toBeGreaterThan(expected * 0.95);
    expect(peak).toBeLessThan(expected * 1.05);
    expect(landed).toBe(true);
    expect(body.grounded).toBe(true);
  });

  it('a short tap gives a lower hop than a held jump', () => {
    const { body } = setup();
    let peak = 0;
    body.step(DT, { ...idle, jumpPressed: true, jumpHeld: true });
    for (let i = 0; i < 240; i++) {
      body.step(DT, idle);
      peak = Math.max(peak, body.y);
    }
    expect(peak).toBeLessThan(1.0);
    expect(peak).toBeGreaterThan(0.2);
  });

  it('a walking jump clears the 1.6 m gaps used between stepping stones', () => {
    const { body } = setup();
    const startZ = body.z;
    body.step(DT, { x: 0, z: -1, run: false, jumpPressed: true, jumpHeld: true });
    for (let i = 0; i < 400 && !(body.grounded && i > 10); i++) {
      body.step(DT, { x: 0, z: -1, run: false, jumpPressed: false, jumpHeld: true });
    }
    expect(startZ - body.z).toBeGreaterThan(2.2);
  });

  it('cannot jump the 6 m bridge gaps, even running', () => {
    const { body } = setup();
    for (let i = 0; i < 120; i++) body.step(DT, { x: 0, z: -1, run: true, jumpPressed: false, jumpHeld: false });
    const startZ = body.z;
    body.step(DT, { x: 0, z: -1, run: true, jumpPressed: true, jumpHeld: true });
    for (let i = 0; i < 400 && !(body.grounded && i > 10); i++) {
      body.step(DT, { x: 0, z: -1, run: true, jumpPressed: false, jumpHeld: true });
    }
    expect(startZ - body.z).toBeLessThan(5.2);
  });

  it('is blocked by walls and tall obstacles', () => {
    const { world, body } = setup();
    world.add(boxCollider(0, -3, 5, 0.5, 2, 0));
    for (let i = 0; i < 480; i++) body.step(DT, { x: 0, z: -1, run: true, jumpPressed: false, jumpHeld: false });
    expect(body.z).toBeGreaterThan(-2.5 + DEFAULT_CHARACTER.radius - 0.01);
  });

  it('walks up small steps but not high ledges', () => {
    const { world, body } = setup();
    world.add(boxCollider(0, -3, 5, 1, 0.2, 0));
    // About 3 m of walking puts Affan on top of the low step.
    for (let i = 0; i < 100; i++) body.step(DT, { x: 0, z: -1, run: false, jumpPressed: false, jumpHeld: false });
    expect(body.z).toBeLessThan(-2.2);
    expect(body.y).toBeCloseTo(0.2, 3);
    world.add(boxCollider(0, -6, 5, 1, 0.9, 0));
    for (let i = 0; i < 480; i++) body.step(DT, { x: 0, z: -1, run: false, jumpPressed: false, jumpHeld: false });
    expect(body.y).toBeLessThan(0.3);
    expect(body.z).toBeGreaterThan(-5.1);
  });

  it('falls when its platform is disabled (a sinking stone)', () => {
    const world = new PhysicsWorld();
    const stone = world.add(discCollider(0, 0, 1, 0, -0.6));
    const body = new CharacterBody(world);
    body.teleport(0, 0.2, 0);
    for (let i = 0; i < 60; i++) body.step(DT, idle);
    expect(body.grounded).toBe(true);
    stone.enabled = false;
    for (let i = 0; i < 120; i++) body.step(DT, idle);
    expect(body.grounded).toBe(false);
    expect(body.y).toBeLessThan(-1);
  });

  it('rides a moving platform', () => {
    const world = new PhysicsWorld();
    const plat = world.add(boxCollider(0, 0, 1.5, 1.5, 0, -0.4));
    const body = new CharacterBody(world);
    body.teleport(0, 0.1, 0);
    for (let i = 0; i < 60; i++) body.step(DT, idle);
    for (let i = 0; i < 240; i++) {
      world.moveTo(plat, plat.x + 0.01, plat.top, plat.z);
      body.step(DT, idle);
    }
    expect(body.grounded).toBe(true);
    expect(body.x).toBeCloseTo(plat.x, 1);
  });

  it('does nothing while frozen', () => {
    const { body } = setup();
    body.active = false;
    for (let i = 0; i < 60; i++) body.step(DT, { x: 1, z: 1, run: true, jumpPressed: true, jumpHeld: true });
    expect(body.x).toBeCloseTo(0, 5);
    expect(body.y).toBeCloseTo(0, 5);
  });
});
