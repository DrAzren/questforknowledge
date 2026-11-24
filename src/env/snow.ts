import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mergeInto, shadow, type Updatable } from './builders';
import type { FlatShape } from './desert';
import { EMOJI_FONT } from './school';

export const SNOW = 0xf1f6fc;
export const SNOW_SHADE = 0xb9cfe8;
export const ICE = 0xa8def7;
export const ICE_DEEP = 0x4f9fdc;
export const CORAL = 0xff6f61;

// One material per look, shared by every prop, so scenery merges into a handful of draw calls.
const shared = new Map<string, THREE.MeshStandardMaterial>();
function sm(key: string, color: number, roughness = 0.9, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  let m = shared.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, ...extra });
    shared.set(key, m);
  }
  return m;
}
const snowMat = (): THREE.MeshStandardMaterial => sm('snow', SNOW, 0.95);
const iceMat = (): THREE.MeshStandardMaterial => sm('ice', ICE, 0.2, { emissive: ICE_DEEP, emissiveIntensity: 0.22, flatShading: true });
const darkMat = (): THREE.MeshStandardMaterial => sm('dark', 0x26324a, 0.7);
const orangeMat = (): THREE.MeshStandardMaterial => sm('orange', 0xff922b, 0.7);
const coralMat = (): THREE.MeshStandardMaterial => sm('coral', CORAL, 0.8);

function ball(r: number, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, detail = 14): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, detail, Math.max(8, Math.round(detail * 0.7))), m);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  return mesh;
}

/** Fuse differently coloured parts into one mesh by painting each part's colour onto its vertices: one draw call instead of several. */
function bake(parts: THREE.Mesh[]): THREE.Mesh {
  const geos = parts.map((m) => {
    m.updateMatrix();
    let g = m.geometry.clone().applyMatrix4(m.matrix);
    if (g.index) g = g.toNonIndexed();
    const c = (m.material as THREE.MeshStandardMaterial).color;
    const n = g.attributes.position.count;
    const colours = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colours.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    g.deleteAttribute('uv');
    return g;
  });
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  return new THREE.Mesh(merged, sm('baked', 0xffffff, 0.8, { vertexColors: true }));
}

/** A pine tree with snow on every tier. */
export function makeSnowTree(rand: () => number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.8, 7), sm('trunk', 0x7a5236));
  trunk.position.y = 0.4;
  g.add(trunk);
  const tiers = 3 + (rand() < 0.4 ? 1 : 0);
  for (let i = 0; i < tiers; i++) {
    const r = 1.2 - i * (0.9 / tiers);
    const h = 1.25;
    const y = 0.7 + i * 0.68;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), sm('pine', 0x2f7d5b, 0.9, { flatShading: true }));
    cone.position.y = y + h / 2;
    const capH = h * 0.6;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.74, capH, 8), snowMat());
    cap.position.y = y + h - capH / 2 + 0.03;
    g.add(cone, cap);
  }
  g.scale.setScalar(scale * (0.9 + rand() * 0.35));
  g.rotation.y = rand() * 6;
  mergeInto(g);
  return g;
}

/** A classic snowman with a carrot nose, scarf and hat, facing +z. */
export function makeSnowman(rand: () => number): THREE.Group {
  const g = new THREE.Group();
  g.add(ball(0.58, snowMat(), 0, 0.5, 0), ball(0.42, snowMat(), 0, 1.26, 0), ball(0.3, snowMat(), 0, 1.84, 0));
  for (const s of [-1, 1]) g.add(ball(0.045, darkMat(), s * 0.11, 1.9, 0.27, 1, 1, 1, 8));
  for (const y of [1.12, 1.3, 1.48]) g.add(ball(0.05, darkMat(), 0, y, 0.41 - Math.abs(y - 1.26) * 0.25, 1, 1, 1, 8));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.3, 8), orangeMat());
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.83, 0.42);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.085, 8, 18), rand() < 0.5 ? coralMat() : sm('scarfBlue', 0x4dabf7, 0.8));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.6;
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 12), darkMat());
  hat.position.y = 2.24;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.04, 14), darkMat());
  brim.position.y = 2.1;
  g.add(nose, scarf, hat, brim);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 5), sm('trunk', 0x7a5236));
    arm.position.set(s * 0.62, 1.42, 0);
    arm.rotation.z = s * -0.95;
    g.add(arm);
  }
  mergeInto(g);
  return g;
}

export type PenguinMode = 'stand' | 'cheer' | 'slide';

/** A small penguin. `userData.mode` chooses how it moves; it faces +z until turned. */
export function makePenguin(phase = 0): Updatable & { userData: { mode: PenguinMode } } {
  const g = new THREE.Group() as unknown as Updatable & { userData: { mode: PenguinMode } };
  const tilt = new THREE.Group();
  g.add(tilt);
  const still: THREE.Mesh[] = [
    ball(0.34, darkMat(), 0, 0.44, 0, 0.92, 1.25, 0.86),
    ball(0.27, snowMat(), 0, 0.4, 0.1, 0.9, 1.22, 0.78),
    ball(0.22, darkMat(), 0, 0.96, 0),
    ball(0.15, snowMat(), 0, 0.92, 0.1, 1.05, 0.95, 0.75),
  ];
  for (const s of [-1, 1]) {
    still.push(ball(0.035, darkMat(), s * 0.08, 0.99, 0.2, 1, 1, 1, 8));
    still.push(ball(0.11, orangeMat(), s * 0.14, 0.035, 0.1, 1, 0.3, 1.5, 8));
  }
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 8), orangeMat());
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.9, 0.26);
  still.push(beak);
  tilt.add(bake(still));
  const flippers = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.3, 0.68, 0);
    pivot.add(ball(0.2, darkMat(), 0, -0.2, 0, 0.3, 1.1, 0.6, 8));
    tilt.add(pivot);
    return pivot;
  });
  g.userData.mode = 'stand';
  g.userData.update = (_dt, time) => {
    const t = time + phase;
    const mode = g.userData.mode;
    if (mode === 'slide') {
      // Belly-sliding: lying forward, flippers swept back.
      tilt.rotation.x = Math.PI / 2;
      tilt.position.set(0, 0.3, -0.4);
      tilt.rotation.z = Math.sin(t * 5) * 0.06;
      flippers.forEach((f, i) => { f.rotation.z = (i ? 1 : -1) * 1.1; });
    } else {
      tilt.rotation.x = 0;
      const hop = mode === 'cheer' ? Math.abs(Math.sin(t * 6)) * 0.28 : 0;
      tilt.position.set(0, hop, 0);
      tilt.rotation.z = Math.sin(t * (mode === 'cheer' ? 6 : 2.4)) * (mode === 'cheer' ? 0.12 : 0.05);
      const flap = mode === 'cheer' ? 1.3 + Math.sin(t * 14) * 0.5 : 0.22 + Math.max(0, Math.sin(t * 1.7)) * 0.25;
      flippers.forEach((f, i) => { f.rotation.z = (i ? 1 : -1) * flap; });
    }
  };
  shadow(g, true, false);
  return g;
}

/** A friendly polar bear sitting in the snow, facing +z. */
export function makePolarBear(): THREE.Group {
  const g = new THREE.Group();
  const fur = sm('bear', 0xf7f1e3, 0.95);
  g.add(
    ball(0.85, fur, 0, 0.82, 0, 1, 1.05, 0.95),
    ball(0.52, fur, 0, 1.92, 0.22),
    ball(0.24, sm('bearSnout', 0xfffdf5, 0.9), 0, 1.8, 0.66, 1, 0.8, 0.9),
    ball(0.075, darkMat(), 0, 1.86, 0.87, 1, 1, 1, 8),
  );
  for (const s of [-1, 1]) {
    g.add(
      ball(0.17, fur, s * 0.4, 2.36, 0.12, 1, 1, 0.6),
      ball(0.055, darkMat(), s * 0.2, 2.02, 0.68, 1, 1, 1, 8),
      ball(0.3, fur, s * 0.62, 0.34, 0.62, 1, 0.75, 1.3),
      ball(0.26, fur, s * 0.78, 1.15, 0.36, 0.85, 1.4, 0.9),
    );
  }
  mergeInto(g);
  return g;
}

/** An igloo with a dark doorway facing +z. */
export function makeIgloo(radius = 1.7): THREE.Group {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), sm('igloo', 0xdcecf9, 0.9, { flatShading: true }));
  const porch = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.42, radius * 0.42, radius * 0.7, 10, 1, false, 0, Math.PI), sm('igloo', 0xdcecf9, 0.9, { flatShading: true }));
  porch.rotation.set(Math.PI / 2, Math.PI / 2, 0);
  porch.position.set(0, 0, radius * 1.0);
  const door = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.3, 12, 0, Math.PI), sm('doorway', 0x1f2f4a, 1));
  door.position.set(0, 0, radius * 1.36);
  g.add(dome, porch, door);
  mergeInto(g);
  return g;
}

/** A snow-capped mountain for the horizon. */
export function makeMountain(size: number): THREE.Group {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.ConeGeometry(size * 0.8, size, 6), sm('mountain', 0x86a3c9, 1, { flatShading: true }));
  rock.position.y = size / 2;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(size * 0.4, size * 0.48, 6), snowMat());
  cap.position.y = size * 0.775;
  g.add(rock, cap);
  mergeInto(g, [], false);
  return g;
}

/** A cluster of ice crystals drawn with the given material (the stage owns it, so it can make them glow). */
export function makeIceCrystals(rand: () => number, material: THREE.Material, scale = 1, count = 4): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const h = (0.7 + rand() * 1.0) * scale;
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.2 * scale * (0.7 + rand() * 0.6), h, 5), material);
    const a = rand() * Math.PI * 2;
    const d = i === 0 ? 0 : 0.25 * scale + rand() * 0.2 * scale;
    c.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d);
    c.rotation.set((rand() - 0.5) * 0.5, rand() * 6, (rand() - 0.5) * 0.5);
    g.add(c);
  }
  mergeInto(g);
  return g;
}

/** A flat sheet of floating ice to stand on. Top surface at y = 0. */
export function makeIceFloe(size: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(size / 2, size / 2 * 0.9, 0.5, 8), iceMat());
  body.position.y = -0.25;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(size / 2 * 0.96, size / 2 * 0.96, 0.08, 8), snowMat());
  top.position.y = -0.03;
  g.add(body, top);
  g.rotation.y = Math.PI / 8;
  return shadow(g);
}

/** One plank of an ice bridge. Top surface at y = 0. */
export function makeIcePlank(width: number, length: number): THREE.Group {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(width, 0.4, length * 0.94), iceMat());
  slab.position.y = -0.2;
  g.add(slab);
  for (const s of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, length * 0.94), snowMat());
    edge.position.set(s * (width / 2 - 0.08), 0.03, 0);
    g.add(edge);
  }
  return shadow(g, false, true);
}

/** A snowball with a few icy dimples so its rolling shows. */
export function makeSnowball(radius: number): THREE.Group {
  const g = new THREE.Group();
  g.add(ball(radius, snowMat(), 0, 0, 0, 1, 1, 1, 16));
  const spots = [[0.9, 0.3, 0.2], [-0.5, 0.8, 0.3], [0.2, -0.6, 0.75], [-0.7, -0.4, -0.55], [0.3, 0.5, -0.8], [0, -0.95, -0.2]];
  for (const [x, y, z] of spots) g.add(ball(radius * 0.2, sm('snowShade', SNOW_SHADE, 0.95), x * radius * 0.93, y * radius * 0.93, z * radius * 0.93, 1, 1, 1, 8));
  mergeInto(g);
  return g;
}

export type FaceSpec =
  | { kind: 'text'; text: string }
  | { kind: 'emoji'; emoji: string }
  | { kind: 'colour'; hex: number }
  | { kind: 'shape'; shape: FlatShape; hex: number };

export type PadState = 'idle' | 'right' | 'wrong';
export type AnswerPadMesh = THREE.Group & { userData: { setFace(f: FaceSpec): void; setState(s: PadState): void } };

/**
 * A block of ice to hop on, whose top shows one possible answer: a letter or
 * number, a picture, a colour or a shape. Top surface at y = 0.
 */
export function makeAnswerPad(radius: number, height: number): AnswerPadMesh {
  const g = new THREE.Group() as AnswerPadMesh;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.1, height, 10), iceMat());
  body.position.y = -height / 2;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.04, radius * 1.04, 0.14, 20), snowMat());
  rim.position.y = -0.075;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.9, 28),
    new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -1 }),
  );
  face.rotation.x = -Math.PI / 2;
  face.position.y = 0.012;
  g.add(body, rim, face);
  let spec: FaceSpec = { kind: 'text', text: '' };
  let state: PadState = 'idle';
  const css = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;
  const draw = (): void => {
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = state === 'right' ? '#d3f9d8' : state === 'wrong' ? '#ffe3e3' : '#fffdf5';
    ctx.beginPath();
    ctx.arc(128, 128, 126, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 16;
    ctx.strokeStyle = state === 'right' ? '#40c057' : state === 'wrong' ? '#ff8787' : '#8ccbf0';
    ctx.beginPath();
    ctx.arc(128, 128, 116, 0, Math.PI * 2);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (spec.kind === 'text') {
      ctx.fillStyle = '#1d2a5c';
      ctx.font = `800 ${spec.text.length > 1 ? 136 : 170}px "Baloo 2", "Trebuchet MS", sans-serif`;
      ctx.fillText(spec.text, 128, 140);
    } else if (spec.kind === 'emoji') {
      ctx.font = `140px ${EMOJI_FONT}`;
      ctx.fillText(spec.emoji, 128, 138);
    } else {
      ctx.fillStyle = css(spec.hex);
      ctx.strokeStyle = 'rgba(29, 42, 92, 0.85)';
      ctx.lineWidth = 9;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const shape = spec.kind === 'colour' ? 'bulatan' : spec.shape;
      if (shape === 'bulatan') ctx.arc(128, 128, 72, 0, Math.PI * 2);
      else if (shape === 'segi empat sama') ctx.rect(62, 62, 132, 132);
      else if (shape === 'segi tiga') {
        ctx.moveTo(128, 50);
        ctx.lineTo(206, 190);
        ctx.lineTo(50, 190);
        ctx.closePath();
      } else ctx.rect(42, 84, 172, 88);
      ctx.fill();
      ctx.stroke();
    }
    tex.needsUpdate = true;
  };
  draw();
  g.userData.setFace = (f) => {
    spec = f;
    state = 'idle';
    draw();
  };
  g.userData.setState = (s) => {
    state = s;
    draw();
  };
  return shadow(g);
}

/** Gently falling snow that always surrounds `userData.center`. */
export function makeSnowfall(count = 320): Updatable & { userData: { center: THREE.Vector3 } } {
  const W = 30, H = 13, D = 34;
  const base = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    base[i * 4] = Math.random() * W;
    base[i * 4 + 1] = Math.random() * H;
    base[i * 4 + 2] = Math.random() * D;
    base[i * 4 + 3] = 0.6 + Math.random() * 0.9;
  }
  const pos = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.11, transparent: true, opacity: 0.9, depthWrite: false })) as unknown as Updatable & { userData: { center: THREE.Vector3 } };
  points.frustumCulled = false;
  points.userData.center = new THREE.Vector3();
  const wrap = (v: number, c: number, size: number): number => c + ((((v - c) % size) + size) % size) - size / 2;
  points.userData.update = (_dt, time) => {
    const c = points.userData.center;
    for (let i = 0; i < count; i++) {
      const speed = base[i * 4 + 3];
      pos[i * 3] = wrap(base[i * 4] + Math.sin(time * 0.7 + i) * 0.5, c.x, W);
      pos[i * 3 + 1] = c.y - 1 + (((base[i * 4 + 1] - time * speed) % H) + H) % H;
      pos[i * 3 + 2] = wrap(base[i * 4 + 2], c.z - 5, D);
    }
    geo.attributes.position.needsUpdate = true;
  };
  return points;
}

/** Ribbons of northern lights. `userData.setStrength(0..1)` fades them in. */
export function makeAurora(): Updatable & { userData: { setStrength(k: number): void } } {
  const g = new THREE.Group() as unknown as Updatable & { userData: { setStrength(k: number): void } };
  const mats: THREE.ShaderMaterial[] = [];
  const pairs: [number, number][] = [[0x69f0ae, 0x7c4dff], [0x40c4ff, 0xea80fc], [0xb2ff59, 0x40c4ff]];
  pairs.forEach(([a, b], i) => {
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, strength: { value: 0 }, low: { value: new THREE.Color(a) }, high: { value: new THREE.Color(b) }, seed: { value: i * 2.1 } },
      vertexShader: `
        uniform float time; uniform float seed; varying vec2 vUv;
        void main(){
          vUv = uv; vec3 p = position;
          p.z += sin(p.x * 0.07 + seed + time * 0.25) * 7.0;
          p.y += sin(p.x * 0.11 + seed * 1.7 + time * 0.4) * 1.6;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform float time; uniform float strength; uniform float seed; uniform vec3 low; uniform vec3 high; varying vec2 vUv;
        void main(){
          float curtain = 0.55 + 0.45 * sin(vUv.x * 60.0 + seed * 3.0 + time * 0.9) * sin(vUv.x * 23.0 - time * 0.5);
          float fade = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
          float ends = smoothstep(0.0, 0.12, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));
          gl_FragColor = vec4(mix(low, high, smoothstep(0.05, 0.7, vUv.y)), strength * fade * ends * curtain * 0.5);
          #include <colorspace_fragment>
        }`,
    });
    mats.push(m);
    const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(130, 20, 64, 1), m);
    ribbon.position.set((i - 1) * 14, 24 + i * 5, -i * 16);
    ribbon.frustumCulled = false;
    ribbon.visible = false;
    g.add(ribbon);
  });
  g.userData.setStrength = (k) => {
    for (const m of mats) m.uniforms.strength.value = k;
    for (const c of g.children) c.visible = k > 0.001;
  };
  g.userData.update = (_dt, time) => {
    for (const m of mats) m.uniforms.time.value = time;
  };
  return g;
}

export type GuardianMood = 'idle' | 'happy' | 'think' | 'cheer';
export type SnowGuardian = Updatable & {
  userData: {
    /** React to an answer, or 'cheer' to raise the crystal for good. */
    setMood(m: GuardianMood): void;
    /** Turn the head toward a point on the ground. */
    lookAt(x: number, z: number): void;
    /** How many of the five shards around the crystal are lit (5 frees the crystal). */
    setLit(n: number): void;
    /** World position of the Frozen Crystal. */
    crystalPosition(out: THREE.Vector3): THREE.Vector3;
    readonly mood: GuardianMood;
    readonly lit: number;
  };
};

/**
 * The Snow Guardian: a giant, gentle snow-being who holds the Frozen Crystal
 * in his mittens. About 5.6 units tall, facing +z. He is plainly a friend:
 * round, smiling, rosy-cheeked, with a warm scarf.
 */
export function makeSnowGuardian(): SnowGuardian {
  const g = new THREE.Group() as unknown as SnowGuardian;
  const snow = new THREE.MeshStandardMaterial({ color: 0xf2f7fd, roughness: 0.95 });
  const ice = new THREE.MeshStandardMaterial({ color: ICE, roughness: 0.2, emissive: ICE_DEEP, emissiveIntensity: 0.3, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d2a5c, roughness: 0.5 });
  const coral = new THREE.MeshStandardMaterial({ color: CORAL, roughness: 0.85 });

  // Body: two great snowballs, with a ring of ice shards at the base.
  const lower = new THREE.Group();
  lower.add(ball(1.95, snow, 0, 1.55, 0, 1, 0.86, 1, 24));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const h = 0.7 + (i % 3) * 0.3;
    const shard = new THREE.Mesh(new THREE.ConeGeometry(0.26, h, 5), ice);
    shard.position.set(Math.cos(a) * 1.75, h / 2 - 0.05, Math.sin(a) * 1.75);
    shard.rotation.set(Math.sin(a) * 0.4, a, -Math.cos(a) * 0.4);
    lower.add(shard);
  }
  mergeInto(lower);
  g.add(lower);

  const torso = new THREE.Group();
  torso.position.y = 3.1;
  torso.add(ball(1.32, snow, 0, 0, 0, 1.05, 1, 0.96, 22));
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.24, 10, 26), coral);
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 0.92;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.1, 0.16), coral);
  tail.position.set(-0.62, 0.36, 1.02);
  tail.rotation.set(0.28, 0, 0.16);
  torso.add(scarf, tail);
  g.add(torso);

  // Head: big kind eyes, rosy cheeks, a carrot nose, a wide smile and a crown of ice.
  const head = new THREE.Group();
  head.position.y = 1.0;
  torso.add(head);
  head.add(ball(0.98, snow, 0, 0.78, 0, 1, 0.94, 0.98, 22));
  const eyes = [-1, 1].map((s) => {
    const eye = new THREE.Group();
    eye.position.set(s * 0.34, 0.95, 0.85);
    eye.add(ball(0.15, dark, 0, 0, 0, 1, 1.15, 0.7, 12));
    eye.add(ball(0.05, new THREE.MeshBasicMaterial({ color: 0xffffff }), s * 0.04, 0.06, 0.09, 1, 1, 1, 8));
    head.add(eye);
    head.add(ball(0.17, new THREE.MeshStandardMaterial({ color: 0xffa8b8, roughness: 0.9 }), s * 0.6, 0.62, 0.7, 1, 0.7, 0.4, 10));
    return eye;
  });
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.6, 10), new THREE.MeshStandardMaterial({ color: 0xff922b, roughness: 0.7 }));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.76, 1.2);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.055, 8, 18, Math.PI), dark);
  smile.rotation.z = Math.PI;
  smile.position.set(0, 0.62, 0.9);
  smile.rotation.x = -0.25;
  head.add(nose, smile);
  const crown = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const a = (i - 2) * 0.42;
    const h = 0.95 - Math.abs(i - 2) * 0.2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.17, h, 5), ice);
    spike.position.set(Math.sin(a) * 0.62, 1.55 + h / 2 - Math.abs(i - 2) * 0.1, Math.cos(a) * 0.3 - 0.05);
    spike.rotation.z = -a * 0.6;
    crown.add(spike);
  }
  mergeInto(crown);
  head.add(crown);

  // Arms reach forward to cradle the crystal.
  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 1.3, 0.45, 0.15);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 1.1, 6, 12), snow);
    upper.position.y = -0.75;
    const mitten = ball(0.46, coral, 0, -1.62, 0, 1, 1, 1, 14);
    pivot.add(upper, mitten);
    torso.add(pivot);
    return pivot;
  });

  // The Frozen Crystal, sealed in a shell of frost, with five dark shards circling it.
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0xbfefff, roughness: 0.1, emissive: 0x66d9ff, emissiveIntensity: 0.12, flatShading: true });
  const holder = new THREE.Group();
  holder.position.set(0, 2.75, 2.0);
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), crystalMat);
  crystal.scale.set(0.8, 1.35, 0.8);
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.0, 1),
    new THREE.MeshStandardMaterial({ color: 0xeaf6ff, roughness: 0.35, transparent: true, opacity: 0.45, flatShading: true, depthWrite: false }),
  );
  const glow = new THREE.PointLight(0x9be7ff, 0, 22, 1.6);
  holder.add(crystal, shell, glow);
  const shards = [0, 1, 2, 3, 4].map((i) => {
    const m = new THREE.MeshStandardMaterial({ color: 0x8aa0b8, roughness: 0.4, emissive: 0xffe066, emissiveIntensity: 0, flatShading: true });
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), m);
    s.scale.set(0.75, 1.3, 0.75);
    holder.add(s);
    return { mesh: s, mat: m, a: (i / 5) * Math.PI * 2 };
  });
  g.add(holder);

  let mood: GuardianMood = 'idle';
  let moodTime = 0;
  let lit = 0;
  let glowNow = 0;
  let lookYaw = 0;
  let headYaw = 0;
  let cheer = 0;
  g.userData.setMood = (m) => {
    mood = m;
    moodTime = 0;
  };
  g.userData.lookAt = (x, z) => {
    const local = g.worldToLocal(new THREE.Vector3(x, 0, z));
    lookYaw = Math.max(-0.7, Math.min(0.7, Math.atan2(local.x, local.z)));
  };
  g.userData.setLit = (n) => {
    lit = Math.max(0, Math.min(5, n));
    shards.forEach((s, i) => {
      s.mat.emissiveIntensity = i < lit ? 1.6 : 0;
      s.mat.color.setHex(i < lit ? 0xffe9a8 : 0x8aa0b8);
    });
    if (lit >= 5) shell.visible = false;
  };
  g.userData.crystalPosition = (out) => holder.getWorldPosition(out);
  Object.defineProperty(g.userData, 'mood', { get: () => mood });
  Object.defineProperty(g.userData, 'lit', { get: () => lit });

  g.userData.update = (dt, time) => {
    moodTime += dt;
    if ((mood === 'happy' && moodTime > 1.7) || (mood === 'think' && moodTime > 1.5)) mood = 'idle';
    cheer += ((mood === 'cheer' ? 1 : 0) - cheer) * Math.min(1, dt * 2.2);
    const breathe = Math.sin(time * 1.4);
    torso.scale.set(1 + breathe * 0.012, 1 + breathe * 0.018, 1 + breathe * 0.012);
    torso.position.y = 3.1 + breathe * 0.03 + cheer * Math.abs(Math.sin(time * 5)) * 0.12;
    headYaw += (lookYaw * (1 - cheer) - headYaw) * Math.min(1, dt * 3);
    head.rotation.y = headYaw;
    head.rotation.x = mood === 'happy' ? Math.sin(moodTime * 11) * 0.16 : -cheer * 0.25 + breathe * 0.015;
    head.rotation.z = mood === 'think' ? Math.sin(Math.min(1, moodTime * 3) * Math.PI / 2) * 0.22 : Math.sin(time * 0.8) * 0.02;
    // Blink.
    const blink = (time % 3.6) < 0.12 ? 0.15 : 1;
    eyes.forEach((e) => { e.scale.y += (blink * (mood === 'happy' ? 0.55 : 1) - e.scale.y) * Math.min(1, dt * 30); });
    // Arms: cradling in front, lifting a little when pleased, raised high for the finale.
    const lift = mood === 'happy' ? Math.sin(Math.min(1, moodTime / 0.3) * Math.PI / 2) * 0.25 : 0;
    arms.forEach((arm, i) => {
      const s = i ? 1 : -1;
      arm.rotation.x = -1.08 - lift - cheer * 1.55 + breathe * 0.02;
      arm.rotation.z = -s * (0.5 - cheer * 0.2);
    });
    // The crystal sits between the mittens and rises overhead in the finale.
    holder.position.set(0, 2.75 + lift * 0.9 + cheer * 4.0 + Math.sin(time * 1.8) * 0.06, 2.0 - cheer * 1.5);
    crystal.rotation.y = time * (0.5 + lit * 0.25);
    shell.rotation.y = -time * 0.2;
    const target = lit / 5;
    glowNow += (target - glowNow) * Math.min(1, dt * 2);
    crystalMat.emissiveIntensity = 0.12 + glowNow * 2.2 + (lit >= 5 ? Math.sin(time * 4) * 0.3 : 0);
    glow.intensity = glowNow * glowNow * 40;
    shards.forEach((s, i) => {
      const a = s.a + time * (0.6 + lit * 0.12);
      const r = 1.25 + (i < lit ? Math.sin(time * 3 + i) * 0.08 : 0);
      s.mesh.position.set(Math.cos(a) * r, Math.sin(a * 2 + i) * 0.25, Math.sin(a) * r);
      s.mesh.rotation.y = time * 2 + i;
    });
  };
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && o !== shell) m.castShadow = true;
  });
  return g;
}
