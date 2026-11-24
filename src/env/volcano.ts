import * as THREE from 'three';
import { labelDecal, mat, mergeInto, shadow, type Updatable } from './builders';

/** Scenery and props for the volcano world. Warm and glowing, never dark or scary. */

export const ROCK = 0x8a7482;
export const ROCK_DARK = 0x5b4a58;
export const ROCK_WARM = 0xa5806f;
export const CRYSTAL_COLORS = [0x66d9e8, 0xb197fc, 0xff8fb1, 0x8ce99a, 0xffd43b];

/** A cluster of glowing crystals. */
const crystalMats = new Map<number, THREE.MeshStandardMaterial>();
/** One shared material per crystal colour, so whole fields of crystals can be drawn together. */
function crystalMat(color: number): THREE.MeshStandardMaterial {
  let m = crystalMats.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.25, emissive: color, emissiveIntensity: 0.55, flatShading: true });
    crystalMats.set(color, m);
  }
  return m;
}

export function makeCrystals(rand: () => number, color: number, scale = 1, count = 4): THREE.Group {
  const g = new THREE.Group();
  const m = crystalMat(color);
  for (let i = 0; i < count; i++) {
    const h = (0.6 + rand() * 0.9) * scale;
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.2 * scale * (0.7 + rand() * 0.6), h, 5), m);
    const a = rand() * Math.PI * 2;
    const d = i === 0 ? 0 : 0.25 * scale + rand() * 0.2 * scale;
    c.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d);
    c.rotation.set((rand() - 0.5) * 0.5, rand() * 6, (rand() - 0.5) * 0.5);
    g.add(c);
  }
  mergeInto(g);
  return g;
}

/** A single upright crystal for the subtraction picture. `setCrossed` dims it and marks it with a cross. */
export function makeCountCrystal(color: number): THREE.Group & { userData: { setCrossed(v: boolean): void } } {
  const g = new THREE.Group() as THREE.Group & { userData: { setCrossed(v: boolean): void } };
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.25, emissive: color, emissiveIntensity: 0.7, flatShading: true });
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), m);
  gem.scale.set(0.85, 1.35, 0.5);
  g.add(gem);
  const cross = new THREE.Group();
  for (const r of [0.78, -0.78]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.1, 0.05), new THREE.MeshBasicMaterial({ color: 0xe03131 }));
    bar.rotation.z = r;
    cross.add(bar);
  }
  cross.position.z = 0.2;
  cross.visible = false;
  g.add(cross);
  g.userData.setCrossed = (v: boolean) => {
    cross.visible = v;
    m.color.setHex(v ? 0x868e96 : color);
    m.emissive.setHex(v ? 0x000000 : color);
    gem.scale.set(v ? 0.7 : 0.85, v ? 1.1 : 1.35, 0.5);
  };
  return g;
}

/** A jagged rock spire. */
export function makeSpire(rand: () => number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const n = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const h = (2.2 + rand() * 3.2) * scale * (i === 0 ? 1 : 0.6);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry((0.7 + rand() * 0.6) * scale, h, 6),
      mat([ROCK, ROCK_DARK, ROCK_WARM][Math.floor(rand() * 3)], 1, { flatShading: true }),
    );
    cone.position.set((rand() - 0.5) * 1.6 * scale * (i ? 1 : 0), h / 2, (rand() - 0.5) * 1.6 * scale * (i ? 1 : 0));
    cone.rotation.y = rand() * 6;
    g.add(cone);
  }
  return shadow(g);
}

/** A friendly volcano for the skyline: a cone with a glowing crater and drifting puffs of smoke. */
export function makeVolcano(size: number): Updatable {
  const g = new THREE.Group() as unknown as Updatable;
  const cone = new THREE.Mesh(
    new THREE.CylinderGeometry(size * 0.2, size * 0.75, size, 9, 1, true),
    mat(0x7a5a66, 1, { flatShading: true }),
  );
  cone.position.y = size / 2;
  g.add(cone);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(size * 0.19, 14), new THREE.MeshBasicMaterial({ color: 0xffa94d }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = size * 0.985;
  g.add(glow);
  for (let i = 0; i < 4; i++) {
    const flow = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.07, size * (0.35 + i * 0.06)), new THREE.MeshBasicMaterial({ color: 0xff922b, side: THREE.DoubleSide }));
    const a = i * 1.7 + 0.4;
    const r = size * 0.33;
    flow.position.set(Math.cos(a) * r, size * 0.74, Math.sin(a) * r);
    flow.lookAt(Math.cos(a) * r * 4, size * 1.5, Math.sin(a) * r * 4);
    g.add(flow);
  }
  const puffs: THREE.Mesh[] = [];
  const puffMat = new THREE.MeshBasicMaterial({ color: 0xf1e4e8, transparent: true, opacity: 0.75, depthWrite: false });
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(size * 0.12, 8, 6), puffMat);
    g.add(p);
    puffs.push(p);
  }
  g.userData.update = (_dt, time) => {
    puffs.forEach((p, i) => {
      const k = (time * 0.12 + i / puffs.length) % 1;
      p.position.set(Math.sin(k * 5 + i) * size * 0.12 + k * size * 0.3, size * (1.02 + k * 0.7), 0);
      p.scale.setScalar(0.6 + k * 1.4);
    });
  };
  return g;
}

/** Wisps of steam rising from a spot on the ground. */
export function makeSteam(height = 2.4): Updatable {
  const g = new THREE.Group() as unknown as Updatable;
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false });
  const puffs: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), m);
    g.add(p);
    puffs.push(p);
  }
  const off = Math.random() * 6;
  g.userData.update = (_dt, time) => {
    puffs.forEach((p, i) => {
      const k = (time * 0.35 + i / puffs.length + off) % 1;
      p.position.set(Math.sin(k * 6 + i) * 0.2, k * height, 0);
      p.scale.setScalar(0.5 + k * 1.3);
    });
  };
  return g;
}

/** A flat-topped slab of dark rock with a glowing rim, used for platforms and bridges. Top surface at y = 0. */
export function makeRockSlab(width: number, depth: number, thickness = 0.5): THREE.Group {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(width, thickness, depth), mat(ROCK_DARK, 0.95, { flatShading: true }));
  slab.position.y = -thickness / 2;
  const top = new THREE.Mesh(new THREE.BoxGeometry(width * 0.92, 0.04, depth * 0.92), mat(ROCK, 0.95));
  top.position.y = 0.005;
  const glow = new THREE.Mesh(new THREE.BoxGeometry(width * 1.04, 0.1, depth * 1.04), new THREE.MeshBasicMaterial({ color: 0xff922b }));
  glow.position.y = -thickness + 0.04;
  g.add(slab, top, glow);
  return shadow(g);
}

/** A round rock to hop on, with a big number on top and little crystals around its foot. Top surface at y = 0. */
export function makeNumberRock(radius: number, height: number, label: string, rand: () => number, crystal = 0x66d9e8): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.12, height, 9), mat(ROCK_DARK, 0.95, { flatShading: true }));
  body.position.y = -height / 2;
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.84, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff7e0, polygonOffset: true, polygonOffsetFactor: -1 }),
  );
  face.rotation.x = -Math.PI / 2;
  face.position.y = 0.012;
  const text = labelDecal(label, { size: radius * 1.6, color: '#3b2a3a', stroke: null, padding: 4 });
  text.position.y = 0.02;
  g.add(body, face, text);
  const ring = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const c = makeCrystals(rand, crystal, 0.45, 2);
    const a = (i / 3) * Math.PI * 2 + rand();
    c.position.set(Math.cos(a) * radius * 1.12, -height, Math.sin(a) * radius * 1.12);
    ring.add(c);
  }
  mergeInto(ring);
  g.add(ring);
  g.userData.face = face;
  return shadow(g);
}

/** A stepping stone for the lava river with its number on top. Top surface at y = 0. */
export function makeLavaStone(radius: number, label: string): THREE.Group & { userData: { setLabel(t: string, color?: string): void; mats: THREE.MeshStandardMaterial[] } } {
  const g = new THREE.Group() as THREE.Group & { userData: { setLabel(t: string, color?: string): void; mats: THREE.MeshStandardMaterial[] } };
  const rockMat = new THREE.MeshStandardMaterial({ color: ROCK_DARK, roughness: 0.95, flatShading: true, transparent: true });
  const topMat = new THREE.MeshStandardMaterial({ color: ROCK, roughness: 0.95, transparent: true });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.86, 0.6, 9), rockMat);
  body.position.y = -0.3;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.93, radius * 0.93, 0.05, 9), topMat);
  top.position.y = 0.002;
  g.add(body, top);
  let text: THREE.Mesh | null = null;
  g.userData.mats = [rockMat, topMat];
  g.userData.setLabel = (t: string, color = '#fff7e0') => {
    text?.removeFromParent();
    text = labelDecal(t, { size: radius * 1.5, color, stroke: '#3b2a3a', padding: 4 });
    text.position.y = 0.04;
    g.add(text);
  };
  g.userData.setLabel(label);
  body.castShadow = true;
  return g;
}

/** A natural rock arch to walk under, like the mouth of a cave. */
export function makeRockArch(width: number, height: number): THREE.Group {
  const g = new THREE.Group();
  const stone = mat(ROCK_DARK, 1, { flatShading: true });
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, height, 7), stone);
    leg.position.set(s * (width / 2 + 0.6), height / 2, 0);
    g.add(leg);
  }
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, width + 3, 7), stone);
  top.rotation.z = Math.PI / 2;
  top.position.y = height + 0.4;
  top.scale.set(1.2, 1, 1);
  g.add(top);
  mergeInto(g);
  return g;
}

/** A small rock that drops from above (the stage handles its warning shadow and landing). */
export function makeFallingRock(radius = 0.6): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 0), mat(ROCK_WARM, 1, { flatShading: true }));
  m.castShadow = true;
  return m;
}

/** Glowing embers drifting upward over lava, drawn as one cloud of points. */
export function makeEmbers(minX: number, maxX: number, minZ: number, maxZ: number, y: number, count = 60): Updatable {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    seed[i * 3] = minX + Math.random() * (maxX - minX);
    seed[i * 3 + 1] = Math.random();
    seed[i * 3 + 2] = minZ + Math.random() * (maxZ - minZ);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0xffc078, size: 0.14, transparent: true, opacity: 0.9, depthWrite: false }),
  ) as unknown as Updatable;
  (pts as unknown as THREE.Points).frustumCulled = false;
  pts.userData.update = (_dt, time) => {
    for (let i = 0; i < count; i++) {
      const k = (seed[i * 3 + 1] + time * 0.18) % 1;
      pos[i * 3] = seed[i * 3] + Math.sin(time + i) * 0.3;
      pos[i * 3 + 1] = y + k * 3.2;
      pos[i * 3 + 2] = seed[i * 3 + 2];
    }
    geo.attributes.position.needsUpdate = true;
  };
  return pts;
}
