import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Reusable scenery and prop builders shared by every world. Each returns a
 * ready-to-place Object3D; anything animated exposes an `update(dt, time)`
 * through `userData.update` so stages can tick props generically.
 */

export type Updatable = THREE.Object3D & { userData: { update?: (dt: number, time: number) => void } };

const matCache = new Map<string, THREE.MeshStandardMaterial>();

export function mat(color: number, roughness = 0.85, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  const key = `${color}:${roughness}:${JSON.stringify(extra)}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });
    matCache.set(key, m);
  }
  return m;
}

export function shadow<T extends THREE.Object3D>(o: T, cast = true, receive = true): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = cast;
      c.receiveShadow = receive;
    }
  });
  return o;
}

/**
 * Merge the static meshes under `root` into one mesh per material, expressed in
 * root's own space, and attach the result to root. Meshes inside any `keep`
 * object are left alone (they animate). Cuts draw calls dramatically.
 */
export function mergeInto(root: THREE.Object3D, keep: THREE.Object3D[] = [], castShadow = true): void {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const done: THREE.Mesh[] = [];
  const visit = (o: THREE.Object3D): void => {
    if (keep.includes(o)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as unknown as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(m.material)) {
      let g = m.geometry.clone();
      if (g.index) g = g.toNonIndexed();
      for (const name of Object.keys(g.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
      }
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      const list = buckets.get(m.material) ?? [];
      list.push(g);
      buckets.set(m.material, list);
      done.push(m);
    }
    for (const c of o.children) visit(c);
  };
  for (const c of root.children) visit(c);
  for (const m of done) m.removeFromParent();
  for (const [material, geos] of buckets) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (geos.length > 1) geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = false;
    root.add(mesh);
  }
}

/**
 * Fuse every plain-coloured part under `root` into a single mesh by painting
 * each part's colour onto its vertices: one draw call instead of one per
 * colour. Textured, glowing and see-through parts are left as they are.
 */
export function bakeColours(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const geos: THREE.BufferGeometry[] = [];
  const done: THREE.Mesh[] = [];
  let flat = false;
  let cast = false;
  let rough = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material)) return;
    const material = m.material as THREE.MeshStandardMaterial;
    if (!material.isMeshStandardMaterial || material.map || material.transparent || material.emissive.getHex() !== 0) return;
    let g = m.geometry.clone();
    if (g.index) g = g.toNonIndexed();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    const n = g.attributes.position.count;
    const colours = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colours.set([material.color.r, material.color.g, material.color.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    geos.push(g);
    done.push(m);
    flat = flat || material.flatShading;
    cast = cast || m.castShadow;
    rough += material.roughness;
  });
  if (geos.length < 2) return;
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  for (const m of done) m.removeFromParent();
  const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough / done.length, flatShading: flat }));
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  root.add(mesh);
}

/** Deterministic pseudo-random generator so scenery is identical on every run. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Text ---------------------------------------------------------------------

export interface LabelOptions {
  size?: number;
  color?: string;
  bg?: string | null;
  stroke?: string | null;
  font?: string;
  padding?: number;
  round?: number;
}

export function labelTexture(text: string, o: LabelOptions = {}): { tex: THREE.CanvasTexture; aspect: number } {
  const font = o.font ?? '900 120px "Baloo 2", "Fredoka", "Trebuchet MS", "Arial Rounded MT Bold", sans-serif';
  const pad = o.padding ?? 36;
  const c = document.createElement('canvas');
  let g = c.getContext('2d')!;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + pad * 2;
  const h = 150 + pad * 2;
  c.width = w;
  c.height = h;
  g = c.getContext('2d')!;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (o.bg) {
    g.fillStyle = o.bg;
    const r = o.round ?? 40;
    g.beginPath();
    g.roundRect(4, 4, w - 8, h - 8, r);
    g.fill();
  }
  if (o.stroke !== null) {
    g.lineWidth = 16;
    g.lineJoin = 'round';
    g.strokeStyle = o.stroke ?? '#1d2a5c';
    g.strokeText(text, w / 2, h / 2 + 6);
  }
  g.fillStyle = o.color ?? '#ffffff';
  g.fillText(text, w / 2, h / 2 + 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, aspect: w / h };
}

/** Text that always faces the camera. `size` is its world-space height. */
export function labelSprite(text: string, o: LabelOptions = {}): THREE.Sprite {
  const { tex, aspect } = labelTexture(text, o);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  const size = o.size ?? 1;
  s.scale.set(size * aspect, size, 1);
  return s;
}

/** Text lying flat on a surface (e.g. the number on a stepping stone). */
export function labelDecal(text: string, o: LabelOptions = {}): THREE.Mesh {
  const { tex, aspect } = labelTexture(text, o);
  const size = o.size ?? 1;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size * aspect, size),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

// ---- Sky & water ----------------------------------------------------------------

export function makeSky(top: number, horizon: number, bottom: number): THREE.Mesh {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(top) },
      horizon: { value: new THREE.Color(horizon) },
      bottom: { value: new THREE.Color(bottom) },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vDir;
      void main(){
        float h = vDir.y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.5));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(220, 24, 16), m);
  sky.renderOrder = -10;
  return sky;
}

/** Stylised animated water: scrolling ripples, foam flecks and a soft shore fade. */
export function makeWater(width: number, depth: number, color = 0x2aa8c9, deep = 0x146f9c): Updatable {
  const m = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      time: { value: 0 },
      shallow: { value: new THREE.Color(color) },
      deep: { value: new THREE.Color(deep) },
      flow: { value: new THREE.Vector2(0.0, 0.35) },
    },
    vertexShader: `
      uniform float time; varying vec2 vUv; varying vec3 vPos;
      void main(){
        vUv = uv; vec3 p = position;
        p.z += sin(p.x * 0.9 + time * 1.6) * 0.035 + cos(p.y * 1.3 + time * 1.2) * 0.035;
        vPos = p;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float time; uniform vec3 shallow; uniform vec3 deep; uniform vec2 flow;
      varying vec2 vUv; varying vec3 vPos;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
      }
      void main(){
        vec2 p = vPos.xy * 0.55 + flow * time;
        float n = noise(p * 1.6) * 0.6 + noise(p * 3.7 - time * 0.2) * 0.4;
        vec3 c = mix(deep, shallow, smoothstep(0.25, 0.8, n));
        float foam = smoothstep(0.74, 0.8, noise(p * 2.6 + vec2(time * 0.25, 0.0)));
        c = mix(c, vec3(1.0), foam * 0.55);
        float sparkle = smoothstep(0.93, 0.97, noise(p * 7.0 + time * 0.6));
        c += sparkle * 0.35;
        gl_FragColor = vec4(c, 0.9);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth, Math.ceil(width), Math.ceil(depth)), m) as unknown as Updatable;
  mesh.rotation.x = -Math.PI / 2;
  mesh.userData.update = (_dt, time) => {
    m.uniforms.time.value = time;
  };
  return mesh;
}

export function makeWaterfall(width: number, height: number): Updatable {
  const g = new THREE.Group() as unknown as Updatable;
  const m = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: { time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform float time; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
      }
      void main(){
        vec2 p = vec2(vUv.x * 9.0, vUv.y * 2.4 + time * 1.5);
        float n = noise(p) * 0.6 + noise(p * vec2(2.3, 1.2) + 4.0) * 0.4;
        vec3 c = mix(vec3(0.42, 0.78, 0.95), vec3(1.0), smoothstep(0.35, 0.8, n));
        float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
        gl_FragColor = vec4(c, 0.92 * edge);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(width, height), m);
  sheet.position.y = height / 2;
  g.add(sheet);
  // Mist puffs at the base.
  const puffs: THREE.Mesh[] = [];
  const puffMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
  for (let i = 0; i < 7; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), puffMat);
    p.position.set((i / 6 - 0.5) * width * 0.9, 0.2, 0.3);
    g.add(p);
    puffs.push(p);
  }
  g.userData.update = (_dt, time) => {
    m.uniforms.time.value = time;
    puffs.forEach((p, i) => {
      const s = 0.8 + Math.sin(time * 2.2 + i * 1.7) * 0.3;
      p.scale.setScalar(s);
      p.position.y = 0.25 + Math.sin(time * 1.6 + i) * 0.15;
    });
  };
  return g;
}

// ---- Vegetation -----------------------------------------------------------------

const LEAF = [0x2f9e44, 0x37b24d, 0x40c057, 0x2b8a3e, 0x51cf66];

export function makeTree(rand: () => number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const h = (3.2 + rand() * 1.8) * scale;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.36 * scale, h, 9), mat(0x7a5230));
  trunk.position.y = h / 2;
  g.add(trunk);
  // Buttress roots.
  for (let i = 0; i < 4; i++) {
    const root = new THREE.Mesh(new THREE.ConeGeometry(0.2 * scale, 0.8 * scale, 6), mat(0x6f4a2b));
    const a = (i / 4) * Math.PI * 2 + rand();
    root.position.set(Math.cos(a) * 0.32 * scale, 0.3 * scale, Math.sin(a) * 0.32 * scale);
    root.rotation.z = Math.cos(a) * -0.5;
    root.rotation.x = Math.sin(a) * 0.5;
    g.add(root);
  }
  const blobs = 5 + Math.floor(rand() * 3);
  for (let i = 0; i < blobs; i++) {
    const r = (1.1 + rand() * 0.8) * scale;
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(LEAF[Math.floor(rand() * LEAF.length)], 0.9, { flatShading: true }));
    const a = rand() * Math.PI * 2;
    const d = rand() * 1.2 * scale;
    leaf.position.set(Math.cos(a) * d, h + (rand() - 0.2) * 1.2 * scale, Math.sin(a) * d);
    leaf.scale.y = 0.8;
    g.add(leaf);
  }
  return shadow(g);
}

export function makePalm(rand: () => number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const h = (4 + rand() * 1.5) * scale;
  const bend = (rand() - 0.5) * 0.9;
  const segs = 7;
  let x = 0;
  for (let i = 0; i < segs; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.17 * scale, 0.2 * scale, h / segs + 0.05, 8), mat(i % 2 ? 0x9a7446 : 0x8a6539));
    const t = (i + 0.5) / segs;
    x = bend * t * t * 1.6;
    seg.position.set(x, t * h, 0);
    seg.rotation.z = -bend * t * 0.55;
    g.add(seg);
  }
  const topX = bend * 1.6;
  const frondGeo = new THREE.SphereGeometry(1, 8, 6);
  for (let i = 0; i < 8; i++) {
    const f = new THREE.Mesh(frondGeo, mat(i % 2 ? 0x37b24d : 0x2f9e44, 0.9, { flatShading: true }));
    const a = (i / 8) * Math.PI * 2;
    f.scale.set(1.5 * scale, 0.09 * scale, 0.42 * scale);
    f.position.set(topX + Math.cos(a) * 1.15 * scale, h - 0.18 * scale, Math.sin(a) * 1.15 * scale);
    f.rotation.y = -a;
    f.rotation.z = -0.42;
    g.add(f);
  }
  for (let i = 0; i < 3; i++) {
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.17 * scale, 8, 8), mat(0x6b4423));
    const a = i * 2.1;
    nut.position.set(topX + Math.cos(a) * 0.22, h - 0.3 * scale, Math.sin(a) * 0.22);
    g.add(nut);
  }
  return shadow(g);
}

export function makeBush(rand: () => number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const n = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const r = (0.45 + rand() * 0.35) * scale;
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(LEAF[Math.floor(rand() * LEAF.length)], 0.9, { flatShading: true }));
    b.position.set((rand() - 0.5) * 0.9 * scale, r * 0.7, (rand() - 0.5) * 0.9 * scale);
    g.add(b);
  }
  return shadow(g);
}

export function makeRock(rand: () => number, scale = 1, color = 0x8d9296): THREE.Mesh {
  const geo = new THREE.DodecahedronGeometry(0.6 * scale, 0);
  const m = new THREE.Mesh(geo, mat(color, 0.95, { flatShading: true }));
  m.scale.set(1 + rand() * 0.5, 0.6 + rand() * 0.4, 1 + rand() * 0.5);
  m.rotation.set(rand(), rand() * 6, rand());
  return shadow(m);
}

/** Many flowers in one draw call. Positions are [x, y, z] triples. */
export function makeFlowers(positions: number[][], rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const colors = [0xff6b9d, 0xffd43b, 0xff8787, 0xb197fc, 0xffffff, 0xff922b];
  const stemGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.22, 5);
  const headGeo = new THREE.IcosahedronGeometry(0.08, 0);
  const stems = new THREE.InstancedMesh(stemGeo, mat(0x2f9e44), positions.length);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), positions.length);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  positions.forEach(([x, y, z], i) => {
    const s = 0.8 + rand() * 0.7;
    m4.makeScale(s, s, s).setPosition(x, y + 0.11 * s, z);
    stems.setMatrixAt(i, m4);
    m4.makeScale(s, s * 0.7, s).setPosition(x, y + 0.24 * s, z);
    heads.setMatrixAt(i, m4);
    heads.setColorAt(i, col.setHex(colors[Math.floor(rand() * colors.length)]));
  });
  heads.instanceColor!.needsUpdate = true;
  g.add(stems, heads);
  return g;
}

/** Tufts of grass in one draw call. */
export function makeGrassTufts(positions: number[][], rand: () => number): THREE.InstancedMesh {
  const geo = new THREE.ConeGeometry(0.06, 0.26, 4);
  const mesh = new THREE.InstancedMesh(geo, mat(0x4cbf5a, 0.9), positions.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  positions.forEach(([x, y, z], i) => {
    const s = 0.6 + rand() * 0.6;
    e.set((rand() - 0.5) * 0.4, rand() * 6, (rand() - 0.5) * 0.4);
    q.setFromEuler(e);
    sc.set(s, s, s);
    pos.set(x, y + 0.12 * s, z);
    m4.compose(pos, q, sc);
    mesh.setMatrixAt(i, m4);
  });
  mesh.receiveShadow = true;
  return mesh;
}

export function makeVine(length: number, rand: () => number): Updatable {
  const g = new THREE.Group() as unknown as Updatable;
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, length, 5), mat(0x3f7d3a));
  rope.position.y = -length / 2;
  g.add(rope);
  for (let i = 0; i < Math.floor(length * 2); i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), mat(0x51cf66, 0.9, { flatShading: true }));
    leaf.scale.set(1, 0.3, 0.6);
    leaf.position.set((rand() - 0.5) * 0.2, -rand() * length, (rand() - 0.5) * 0.2);
    leaf.rotation.y = rand() * 6;
    g.add(leaf);
  }
  mergeInto(g, [], false);
  const off = rand() * 6;
  g.userData.update = (_dt, time) => {
    g.rotation.z = Math.sin(time * 0.9 + off) * 0.07;
    g.rotation.x = Math.cos(time * 0.7 + off) * 0.05;
  };
  return g;
}

// ---- Creatures ------------------------------------------------------------------

export function makeButterflies(count: number, area: THREE.Box3, rand: () => number): Updatable {
  const g = new THREE.Group() as unknown as Updatable;
  const colors = [0xffd43b, 0xff6b9d, 0x74c0fc, 0xffa94d, 0xda77f2];
  const wingGeo = new THREE.CircleGeometry(0.12, 8);
  wingGeo.translate(0.11, 0, 0);
  const flies: { o: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; c: THREE.Vector3; ph: number; rad: number; sp: number }[] = [];
  const size = new THREE.Vector3();
  area.getSize(size);
  for (let i = 0; i < count; i++) {
    const o = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide });
    const l = new THREE.Mesh(wingGeo, m);
    const r = new THREE.Mesh(wingGeo, m);
    r.scale.x = -1;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.1, 2, 5), mat(0x3b2a1a));
    body.rotation.x = Math.PI / 2;
    o.add(l, r, body);
    g.add(o);
    flies.push({
      o, l, r,
      c: new THREE.Vector3(area.min.x + rand() * size.x, area.min.y + rand() * size.y, area.min.z + rand() * size.z),
      ph: rand() * 6, rad: 0.8 + rand() * 1.6, sp: 0.5 + rand() * 0.6,
    });
  }
  g.userData.update = (_dt, time) => {
    for (const f of flies) {
      const a = time * f.sp + f.ph;
      f.o.position.set(f.c.x + Math.cos(a) * f.rad, f.c.y + Math.sin(a * 2.3) * 0.35, f.c.z + Math.sin(a) * f.rad);
      f.o.rotation.y = -a;
      const flap = Math.sin(time * 16 + f.ph) * 1.0;
      f.l.rotation.y = flap;
      f.r.rotation.y = -flap;
    }
  };
  return g;
}

/** A friendly, round cartoon crocodile that paddles about. Never attacks. */
export function makeCrocodile(): Updatable {
  const g = new THREE.Group() as unknown as Updatable;
  const green = mat(0x4f9d3f, 0.8);
  const belly = mat(0xd8e8a0, 0.8);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.3, 6, 14), green);
  body.rotation.x = Math.PI / 2;
  body.scale.set(1.15, 1, 0.62);
  g.add(body);
  const under = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 1.2, 6, 12), belly);
  under.rotation.x = Math.PI / 2;
  under.scale.set(1.05, 1, 0.5);
  under.position.y = -0.09;
  g.add(under);
  const head = new THREE.Group();
  head.position.z = 1.0;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10), green);
  skull.scale.set(1.05, 0.62, 1.0);
  head.add(skull);
  const snout = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.6, 5, 12), green);
  snout.rotation.x = Math.PI / 2;
  snout.scale.set(1.15, 1, 0.5);
  snout.position.set(0, -0.03, 0.55);
  head.add(snout);
  const jaw = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.55, 5, 10), belly);
  jaw.rotation.x = Math.PI / 2;
  jaw.scale.set(1.1, 1, 0.35);
  jaw.position.set(0, -0.14, 0.5);
  head.add(jaw);
  // A row of rounded, harmless teeth for a goofy grin.
  for (let i = 0; i < 5; i++) {
    for (const s of [-1, 1]) {
      const tooth = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), mat(0xffffff, 0.4));
      tooth.position.set(s * 0.22, -0.09, 0.3 + i * 0.14);
      head.add(tooth);
    }
  }
  for (const s of [-1, 1]) {
    const bump = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), green);
    bump.position.set(s * 0.2, 0.22, 0.05);
    head.add(bump);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat(0xffffff, 0.3));
    eye.position.set(s * 0.2, 0.27, 0.12);
    head.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), mat(0x1a1a1a, 0.3));
    pupil.position.set(s * 0.2, 0.28, 0.2);
    head.add(pupil);
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), mat(0x2c5e22));
    nostril.position.set(s * 0.09, 0.07, 1.02);
    head.add(nostril);
  }
  g.add(head);
  const tail: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.Mesh(new THREE.SphereGeometry(0.32 - i * 0.05, 10, 8), green);
    seg.scale.set(1, 0.6, 1.3);
    seg.position.z = -0.95 - i * 0.36;
    g.add(seg);
    tail.push(seg);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 5), mat(0x3b7d2f));
    spike.position.set(0, 0.2 - i * 0.03, -0.95 - i * 0.36);
    g.add(spike);
  }
  for (let i = 0; i < 4; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 5), mat(0x3b7d2f));
    spike.position.set(0, 0.27, -0.55 + i * 0.36);
    g.add(spike);
  }
  // Tail segments, head and jaw animate; everything else collapses into a few meshes.
  mergeInto(head, [jaw], false);
  mergeInto(g, [head, ...tail], false);
  const off = Math.random() * 6;
  g.userData.update = (_dt, time) => {
    tail.forEach((seg, i) => {
      seg.position.x = Math.sin(time * 3 + off - i * 0.7) * 0.07 * (i + 1);
    });
    head.rotation.y = Math.sin(time * 1.1 + off) * 0.15;
    jaw.position.y = -0.14 - Math.max(0, Math.sin(time * 0.9 + off)) * 0.07;
  };
  return g;
}

/** A plump jungle bird (toucan-like) that bobs on its perch. */
export function makeBird(color = 0xffc93c): Updatable {
  const g = new THREE.Group() as unknown as Updatable;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), mat(0x22262e, 0.7));
  body.scale.set(1, 1.15, 1);
  g.add(body);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), mat(0xffffff, 0.7));
  chest.position.set(0, -0.02, 0.11);
  g.add(chest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), mat(0x22262e, 0.7));
  head.position.set(0, 0.3, 0.06);
  g.add(head);
  const beak = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.26, 4, 10), mat(color, 0.5));
  beak.rotation.x = Math.PI / 2 + 0.15;
  beak.position.set(0, 0.27, 0.3);
  g.add(beak);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.076, 8, 8), mat(0xff6b35, 0.5));
  tip.position.set(0, 0.24, 0.45);
  g.add(tip);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), mat(0xffffff, 0.3));
    eye.position.set(s * 0.1, 0.35, 0.19);
    g.add(eye);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), mat(0x000000, 0.3));
    p.position.set(s * 0.105, 0.35, 0.225);
    g.add(p);
    const wing = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), mat(0x2f3540, 0.7));
    wing.scale.set(0.35, 1, 0.8);
    wing.position.set(s * 0.24, 0, -0.02);
    g.add(wing);
  }
  mergeInto(g, [head]);
  head.castShadow = true;
  const off = Math.random() * 6;
  const baseY = { v: Number.NaN };
  g.userData.update = (_dt, time) => {
    if (Number.isNaN(baseY.v)) baseY.v = g.position.y;
    g.position.y = baseY.v + Math.abs(Math.sin(time * 2 + off)) * 0.04;
    head.rotation.z = Math.sin(time * 1.3 + off) * 0.25;
  };
  return g;
}

// ---- Gameplay props ---------------------------------------------------------------

export function makeCoin(): Updatable {
  const g = new THREE.Group() as unknown as Updatable;
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.26, 0.07, 20),
    new THREE.MeshStandardMaterial({ color: 0xffc928, roughness: 0.3, metalness: 0.6, emissive: 0x7a4b00, emissiveIntensity: 0.35 }),
  );
  coin.rotation.x = Math.PI / 2;
  g.add(coin);
  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.17, 0.085, 5),
    new THREE.MeshStandardMaterial({ color: 0xffe066, roughness: 0.3, metalness: 0.5, emissive: 0x7a4b00, emissiveIntensity: 0.3 }),
  );
  inner.rotation.x = Math.PI / 2;
  g.add(inner);
  coin.castShadow = true;
  const off = Math.random() * 6;
  g.userData.update = (_dt, time) => {
    g.rotation.y = time * 2.6 + off;
    coin.position.y = inner.position.y = Math.sin(time * 2.4 + off) * 0.06;
  };
  return g;
}

export function starGeometry(outer = 0.42, inner = 0.19, depth = 0.14): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

export function makeStar(): Updatable {
  const g = new THREE.Group() as unknown as Updatable;
  const star = new THREE.Mesh(
    starGeometry(),
    new THREE.MeshStandardMaterial({ color: 0xffd43b, roughness: 0.25, metalness: 0.3, emissive: 0xffa200, emissiveIntensity: 0.6 }),
  );
  star.castShadow = true;
  g.add(star);
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(0.75, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff3a0, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }),
  );
  g.add(halo);
  g.userData.update = (_dt, time) => {
    star.rotation.y = time * 1.8;
    star.position.y = Math.sin(time * 2) * 0.1;
    halo.scale.setScalar(1 + Math.sin(time * 3) * 0.12);
    halo.position.y = star.position.y;
  };
  return g;
}

export type GemShape = 'bulat' | 'segi empat' | 'segi tiga' | 'bintang';
export const GEM_COLORS: Record<string, number> = {
  merah: 0xfa5252,
  biru: 0x339af0,
  kuning: 0xfcc419,
  hijau: 0x40c057,
};

export function makeGem(shape: GemShape, colorName: string): Updatable {
  const color = GEM_COLORS[colorName] ?? 0xffffff;
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.2, metalness: 0.1, emissive: color, emissiveIntensity: 0.28 });
  let geo: THREE.BufferGeometry;
  switch (shape) {
    case 'bulat': geo = new THREE.SphereGeometry(0.34, 20, 16); break;
    case 'segi empat': geo = new THREE.BoxGeometry(0.56, 0.56, 0.56); break;
    case 'segi tiga': geo = new THREE.ConeGeometry(0.4, 0.62, 3); break;
    default: geo = starGeometry(0.42, 0.19, 0.18); break;
  }
  const g = new THREE.Group() as unknown as Updatable;
  const mesh = new THREE.Mesh(geo, m);
  mesh.castShadow = true;
  g.add(mesh);
  const off = Math.random() * 6;
  g.userData.update = (_dt, time) => {
    mesh.rotation.y = time * 1.2 + off;
    mesh.position.y = Math.sin(time * 2 + off) * 0.08;
  };
  return g;
}

/** A mossy stepping stone, optionally with a big number/letter painted on top. */
export function makeStone(radius: number, label?: string, tint = 0x9aa0a6): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.88, 0.5, 18), mat(tint, 0.95));
  top.position.y = -0.25;
  g.add(top);
  const moss = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.99, radius * 1.01, 0.07, 18), mat(0x69b34c, 0.95));
  moss.position.y = -0.02;
  g.add(moss);
  if (label) {
    const badge = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.74, 28),
      new THREE.MeshBasicMaterial({ color: 0xfff7d6, polygonOffset: true, polygonOffsetFactor: -1 }),
    );
    badge.rotation.x = -Math.PI / 2;
    badge.position.y = 0.022;
    g.add(badge);
    const text = labelDecal(label, { size: radius * 1.7, color: '#1d2a5c', stroke: null, padding: 4 });
    text.position.y = 0.03;
    g.add(text);
  }
  return shadow(g);
}

export function makeSign(text: string, width = 2.6): THREE.Group {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.9, 8), mat(0x7a5230));
    post.position.set(s * width * 0.36, 0.95, 0);
    g.add(post);
  }
  const board = new THREE.Mesh(new THREE.BoxGeometry(width, 1.0, 0.12), mat(0xa9744a));
  board.position.y = 1.65;
  g.add(board);
  const { tex, aspect } = labelTexture(text, { color: '#fff7d6', stroke: '#4a2c12' });
  const h = Math.min(0.78, (width * 0.9) / aspect);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(h * aspect, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  face.position.set(0, 1.65, 0.07);
  g.add(face);
  return shadow(g);
}

export function makeCheckpointFlag(): Updatable {
  const g = new THREE.Group() as unknown as Updatable;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), mat(0xf1f3f5, 0.5));
  pole.position.y = 1.1;
  g.add(pole);
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xadb5bd, side: THREE.DoubleSide, roughness: 0.8 });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5, 6, 1), flagMat);
  flag.position.set(0.42, 1.85, 0);
  g.add(flag);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), mat(0xffd43b, 0.4));
  knob.position.y = 2.24;
  g.add(knob);
  shadow(g);
  g.userData.setActive = (v: boolean) => {
    flagMat.color.setHex(v ? 0x40c057 : 0xadb5bd);
    flagMat.emissive.setHex(v ? 0x1c7c2e : 0x000000);
  };
  const posAttr = flag.geometry.attributes.position;
  g.userData.update = (_dt, time) => {
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      posAttr.setZ(i, Math.sin(x * 5 + time * 5) * 0.06 * (x + 0.4));
    }
    posAttr.needsUpdate = true;
  };
  return g;
}

/** The glowing arch at the end of a stage. */
export function makeGoalArch(): Updatable {
  const g = new THREE.Group() as unknown as Updatable;
  const arch = new THREE.Mesh(
    new THREE.TorusGeometry(1.5, 0.2, 12, 28, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0xffd43b, emissive: 0xff9f1a, emissiveIntensity: 0.5, roughness: 0.4 }),
  );
  arch.position.y = 0.1;
  g.add(arch);
  for (const s of [-1, 1]) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.3, 12), mat(0xb08b4f));
    base.position.set(s * 1.5, 0.15, 0);
    g.add(base);
  }
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(1.32, 28, 0, Math.PI),
    new THREE.MeshBasicMaterial({ color: 0xfff3a0, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  );
  glow.position.y = 0.1;
  g.add(glow);
  const star = new THREE.Mesh(starGeometry(0.4, 0.18, 0.12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe066, emissiveIntensity: 0.9 }));
  star.position.y = 1.95;
  g.add(star);
  shadow(g, true, false);
  g.userData.update = (_dt, time) => {
    star.rotation.y = time * 2;
    (glow.material as THREE.MeshBasicMaterial).opacity = 0.28 + Math.sin(time * 3) * 0.1;
  };
  return g;
}

export function makeChest(): Updatable {
  const g = new THREE.Group() as unknown as Updatable;
  const wood = mat(0x9c5a2c, 0.8);
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc928, roughness: 0.3, metalness: 0.6 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.75, 1.0), wood);
  base.position.y = 0.375;
  g.add(base);
  const lid = new THREE.Group();
  lid.position.set(0, 0.75, -0.5);
  const lidMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.5, 16, 1, false, 0, Math.PI), wood);
  lidMesh.rotation.z = Math.PI / 2;
  lidMesh.rotation.y = Math.PI / 2;
  lidMesh.position.set(0, 0, 0.5);
  lid.add(lidMesh);
  for (const x of [-0.6, 0, 0.6]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 1.04), gold);
    band.position.set(x, 0.375, 0);
    g.add(band);
    const lband = new THREE.Mesh(new THREE.TorusGeometry(0.51, 0.045, 6, 16, Math.PI), gold);
    lband.rotation.y = Math.PI / 2;
    lband.position.set(x, 0, 0.5);
    lid.add(lband);
  }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.08), gold);
  lock.position.set(0, 0.62, 0.53);
  g.add(lock);
  g.add(lid);
  const light = new THREE.PointLight(0xffd866, 0, 6);
  light.position.set(0, 1.0, 0);
  g.add(light);
  shadow(g);
  let open = 0;
  let target = 0;
  g.userData.open = () => { target = 1; };
  g.userData.update = (dt) => {
    open += (target - open) * Math.min(1, dt * 4);
    lid.rotation.x = -open * 1.9;
    light.intensity = open * 6;
  };
  return g;
}

/** Simple burst of confetti/sparkles used for rewards. */
export class Sparkles {
  readonly points: THREE.Points;
  private vel: Float32Array;
  private life: Float32Array;
  private next = 0;
  private readonly max = 260;

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.max * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.max * 3), 3));
    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < this.max; i++) pos.setXYZ(i, 0, -999, 0);
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.2, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true }),
    );
    this.points.frustumCulled = false;
  }

  burst(at: THREE.Vector3, count = 30, colors = [0xffd43b, 0xff6b9d, 0x74c0fc, 0x69db7c, 0xffffff], power = 4): void {
    const pos = this.points.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.points.geometry.attributes.color as THREE.BufferAttribute;
    const c = new THREE.Color();
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      pos.setXYZ(i, at.x, at.y, at.z);
      const a = Math.random() * Math.PI * 2;
      const up = 0.4 + Math.random() * 0.9;
      const sp = power * (0.4 + Math.random() * 0.8);
      this.vel[i * 3] = Math.cos(a) * sp * 0.6;
      this.vel[i * 3 + 1] = up * sp;
      this.vel[i * 3 + 2] = Math.sin(a) * sp * 0.6;
      this.life[i] = 0.8 + Math.random() * 0.7;
      c.setHex(colors[Math.floor(Math.random() * colors.length)]);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  update(dt: number): void {
    const pos = this.points.geometry.attributes.position as THREE.BufferAttribute;
    let dirty = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      dirty = true;
      if (this.life[i] <= 0) {
        pos.setXYZ(i, 0, -999, 0);
        continue;
      }
      this.vel[i * 3 + 1] -= 9 * dt;
      pos.setXYZ(
        i,
        pos.getX(i) + this.vel[i * 3] * dt,
        pos.getY(i) + this.vel[i * 3 + 1] * dt,
        pos.getZ(i) + this.vel[i * 3 + 2] * dt,
      );
    }
    if (dirty) pos.needsUpdate = true;
  }
}
