import * as THREE from 'three';
import { labelDecal, mat, mergeInto, shadow, starGeometry, type Updatable } from './builders';

/** Scenery and props for the desert world. */

export const SAND = 0xedc978;
export const SAND_DARK = 0xcfa353;
export const SANDSTONE = 0xd9b27c;
export const SANDSTONE_DARK = 0xb98d57;

export type FlatShape = 'bulatan' | 'segi empat sama' | 'segi tiga' | 'segi empat tepat';
export const FLAT_SHAPES: FlatShape[] = ['bulatan', 'segi empat sama', 'segi tiga', 'segi empat tepat'];
export const FLAT_SHAPE_ICON: Record<FlatShape, string> = {
  bulatan: '🔵', 'segi empat sama': '🟦', 'segi tiga': '🔺', 'segi empat tepat': '▬',
};

export const CARPET_COLORS: Record<string, number> = {
  merah: 0xe03131,
  biru: 0x1c7ed6,
  kuning: 0xf5b800,
  hijau: 0x2f9e44,
  oren: 0xf76707,
  ungu: 0x7048e8,
};
export const CARPET_ICON: Record<string, string> = {
  merah: '🟥', biru: '🟦', kuning: '🟨', hijau: '🟩', oren: '🟧', ungu: '🟪',
};

/** A flat coloured shape lying on the ground (pressure plates, signs). `size` is its largest dimension. */
export function makeFlatShape(shape: FlatShape, color: number, size: number): THREE.Mesh {
  let geo: THREE.BufferGeometry;
  const h = size / 2;
  switch (shape) {
    case 'bulatan':
      geo = new THREE.CircleGeometry(h, 40);
      break;
    case 'segi empat sama':
      geo = new THREE.PlaneGeometry(size * 0.86, size * 0.86);
      break;
    case 'segi tiga': {
      const s = new THREE.Shape();
      s.moveTo(0, h);
      s.lineTo(h * 0.95, -h * 0.72);
      s.lineTo(-h * 0.95, -h * 0.72);
      s.closePath();
      geo = new THREE.ShapeGeometry(s);
      break;
    }
    default:
      geo = new THREE.PlaneGeometry(size, size * 0.5);
      break;
  }
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** A round sandstone plate on the floor with a big shape painted on it. */
export function makePressurePlate(shape: FlatShape, color: number, radius = 1.25): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.06, 0.12, 28), mat(SANDSTONE, 0.95));
  base.position.y = 0.06;
  base.receiveShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.97, 0.06, 8, 32), mat(SANDSTONE_DARK, 0.95));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.12;
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.88, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff7e0, polygonOffset: true, polygonOffsetFactor: -1 }),
  );
  face.rotation.x = -Math.PI / 2;
  face.position.y = 0.125;
  const mark = makeFlatShape(shape, color, radius * 1.25);
  mark.position.y = 0.135;
  g.add(base, rim, face, mark);
  g.userData.face = face;
  g.userData.mark = mark;
  return g;
}

export function makeCactus(rand: () => number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const green = mat(0x3f9b4b, 0.85);
  const h = (1.5 + rand() * 0.9) * scale;
  const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(0.28 * scale, h, 5, 12), green);
  trunk.position.y = h / 2 + 0.1 * scale;
  g.add(trunk);
  const arms = 1 + Math.floor(rand() * 2);
  for (let i = 0; i < arms; i++) {
    const side = i === 0 ? 1 : -1;
    const y = h * (0.35 + rand() * 0.25);
    const out = new THREE.Mesh(new THREE.CapsuleGeometry(0.17 * scale, 0.36 * scale, 4, 10), green);
    out.rotation.z = Math.PI / 2;
    out.position.set(side * 0.45 * scale, y, 0);
    const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.17 * scale, (0.45 + rand() * 0.4) * scale, 4, 10), green);
    up.position.set(side * 0.68 * scale, y + 0.42 * scale, 0);
    g.add(out, up);
  }
  const flower = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13 * scale, 0), mat(0xff6b9d, 0.6));
  flower.position.y = h + 0.42 * scale;
  g.add(flower);
  g.rotation.y = rand() * 6;
  return shadow(g);
}

/** A soft sand dune: a squashed dome sitting on the ground. */
export function makeDune(w: number, h: number, d: number, color = SAND): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(color, 1));
  m.scale.set(w / 2, h, d / 2);
  m.receiveShadow = true;
  return m;
}

export function makePyramid(size: number, color = SANDSTONE): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.ConeGeometry(size * 0.72, size, 4), mat(color, 1, { flatShading: true }));
  m.rotation.y = Math.PI / 4;
  m.position.y = size / 2;
  return m;
}

/** A weathered sandstone column, optionally broken off short. */
export function makeColumn(height: number, radius = 0.42): THREE.Group {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.9, radius, height, 12), mat(SANDSTONE, 0.95));
  shaft.position.y = height / 2;
  const base = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.6, 0.3, radius * 2.6), mat(SANDSTONE_DARK, 0.95));
  base.position.y = 0.15;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.4, 0.26, radius * 2.4), mat(SANDSTONE_DARK, 0.95));
  cap.position.y = height + 0.1;
  g.add(shaft, base, cap);
  return shadow(g);
}

/** A broken ruin wall made of sandstone blocks. */
export function makeRuinWall(rand: () => number, length: number, height: number): THREE.Group {
  const g = new THREE.Group();
  const bw = 1.1;
  const bh = 0.6;
  const cols = Math.ceil(length / bw);
  const rows = Math.ceil(height / bh);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Crumble the top edge unevenly.
      if (r > rows * 0.5 && rand() < (r / rows) * 0.75) continue;
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(bw * 0.96, bh * 0.94, 0.7),
        mat(rand() < 0.5 ? SANDSTONE : SANDSTONE_DARK, 0.95),
      );
      block.position.set((c - cols / 2 + 0.5) * bw + (r % 2 ? bw * 0.25 : 0), r * bh + bh / 2, 0);
      g.add(block);
    }
  }
  return shadow(g);
}

/** A friendly cartoon camel that chews and flicks its ears. */
export function makeCamel(): Updatable {
  const g = new THREE.Group() as unknown as Updatable;
  const fur = mat(0xd9a45b, 0.9);
  const furDark = mat(0xb9853f, 0.9);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 14), fur);
  body.scale.set(0.85, 0.78, 1.4);
  body.position.y = 1.28;
  g.add(body);
  const hump = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), fur);
  hump.scale.set(0.8, 1.0, 0.9);
  hump.position.set(0, 1.84, -0.08);
  g.add(hump);
  // A colourful saddle blanket.
  const blanket = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.62, 16, 1, true, -Math.PI / 2.4, Math.PI / 1.2), mat(0xe03131, 0.8, { side: THREE.DoubleSide }));
  blanket.rotation.x = Math.PI / 2;
  blanket.rotation.z = Math.PI / 2;
  blanket.scale.set(1, 1, 0.96);
  blanket.position.set(0, 1.36, -0.05);
  g.add(blanket);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(0.565, 0.035, 6, 18, Math.PI / 1.2), mat(0xfcc419, 0.7));
  trim.rotation.set(0, Math.PI / 2, Math.PI / 2 - Math.PI / 2.4);
  for (const z of [-0.36, 0.26]) {
    const t = trim.clone();
    t.position.set(0, 1.36, z);
    g.add(t);
  }
  for (const [x, z] of [[-0.3, 0.55], [0.3, 0.55], [-0.3, -0.55], [0.3, -0.55]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.95, 8), fur);
    leg.position.set(x, 0.52, z);
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.12, 8), furDark);
    hoof.position.set(x, 0.06, z);
    g.add(leg, hoof);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5), furDark);
  tail.position.set(0, 1.2, -0.92);
  tail.rotation.x = 0.4;
  g.add(tail);
  // Neck and head form the animated part.
  const neck = new THREE.Group();
  neck.position.set(0, 1.42, 0.68);
  const neckMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.72, 4, 10), fur);
  neckMesh.position.set(0, 0.42, 0.14);
  neckMesh.rotation.x = 0.32;
  neck.add(neckMesh);
  const head = new THREE.Group();
  head.position.set(0, 0.92, 0.3);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.25, 14, 12), fur);
  skull.scale.set(0.9, 0.9, 1.1);
  head.add(skull);
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), mat(0xe8bf80, 0.9));
  snout.scale.set(0.95, 0.8, 1.15);
  snout.position.set(0, -0.07, 0.26);
  head.add(snout);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat(0xe8bf80, 0.9));
  jaw.scale.set(1, 0.5, 1.2);
  jaw.position.set(0, -0.2, 0.26);
  head.add(jaw);
  const ears: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 6), furDark);
    ear.position.set(s * 0.18, 0.22, -0.05);
    ear.rotation.z = s * -0.5;
    head.add(ear);
    ears.push(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), mat(0xffffff, 0.3));
    eye.position.set(s * 0.17, 0.07, 0.17);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), mat(0x1a1a1a, 0.3));
    pupil.position.set(s * 0.19, 0.07, 0.21);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), fur);
    lid.position.set(s * 0.17, 0.08, 0.17);
    head.add(eye, pupil, lid);
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), furDark);
    nostril.position.set(s * 0.06, -0.03, 0.47);
    head.add(nostril);
  }
  neck.add(head);
  g.add(neck);
  mergeInto(head, [jaw, ...ears]);
  mergeInto(neck, [head]);
  mergeInto(g, [neck]);
  const off = Math.random() * 6;
  g.userData.update = (_dt, time) => {
    neck.rotation.x = Math.sin(time * 0.8 + off) * 0.06;
    head.rotation.y = Math.sin(time * 0.5 + off) * 0.35;
    jaw.position.x = Math.sin(time * 5 + off) * 0.02;
    jaw.position.y = -0.2 - Math.abs(Math.sin(time * 5 + off)) * 0.025;
    ears.forEach((ear, i) => {
      ear.rotation.x = Math.max(0, Math.sin(time * 2.3 + off + i)) * 0.5;
    });
  };
  return g;
}

/** A big round rock with a sleepy face: it only ever nudges Affan aside. */
export function makeBoulder(radius: number): THREE.Group {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 2), mat(0xb9966b, 1, { flatShading: true }));
  g.add(rock);
  for (let i = 0; i < 6; i++) {
    const spot = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * 0.22, 0), mat(0x9c7b52, 1, { flatShading: true }));
    const a = i * 1.9;
    const b = i * 1.1;
    spot.position.set(Math.cos(a) * Math.sin(b) * radius * 0.9, Math.cos(b) * radius * 0.9, Math.sin(a) * Math.sin(b) * radius * 0.9);
    g.add(spot);
  }
  mergeInto(g);
  return g;
}

/** A woven flying carpet in one strong colour, with a pale border and tassels. */
export function makeCarpet(color: number, width = 2.8, depth = 2.2): Updatable {
  const g = new THREE.Group() as unknown as Updatable;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 200;
  const ctx = c.getContext('2d')!;
  const css = `#${color.toString(16).padStart(6, '0')}`;
  ctx.fillStyle = '#fff3d6';
  ctx.fillRect(0, 0, 256, 200);
  ctx.fillStyle = css;
  ctx.fillRect(14, 14, 228, 172);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 6;
  ctx.strokeRect(30, 30, 196, 140);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.moveTo(128, 62);
  ctx.lineTo(166, 100);
  ctx.lineTo(128, 138);
  ctx.lineTo(90, 100);
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  const side = mat(color, 0.9);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, depth, 10, 1, 1), [side, side, top, side, side, side]);
  slab.position.y = -0.06;
  slab.castShadow = true;
  slab.receiveShadow = true;
  g.add(slab);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.24, 5), mat(0xffe08a, 0.8));
      tassel.position.set(s * (width / 2 + 0.1), -0.08, (i / 6 - 0.5) * depth * 0.9);
      tassel.rotation.z = s * -1.2;
      g.add(tassel);
    }
  }
  g.userData.top = top;
  // A gentle ripple along the carpet, as if it floats on air.
  const pos = slab.geometry.attributes.position;
  const baseY = Float32Array.from({ length: pos.count }, (_, i) => pos.getY(i));
  const off = Math.random() * 6;
  g.userData.update = (_dt, time) => {
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, baseY[i] + Math.sin(pos.getX(i) * 2.2 + time * 3 + off) * 0.035);
    }
    pos.needsUpdate = true;
  };
  return g;
}

/** A sandstone drum to jump on, with a big number on top. */
export function makeDrum(radius: number, height: number, label: string): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.05, height, 20), mat(SANDSTONE, 0.95));
  body.position.y = -height / 2;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.03, radius * 1.03, 0.14, 20), mat(0x2f8fe8, 0.7));
  band.position.y = -0.2;
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.86, 28),
    new THREE.MeshBasicMaterial({ color: 0xfff7e0, polygonOffset: true, polygonOffsetFactor: -1 }),
  );
  face.rotation.x = -Math.PI / 2;
  face.position.y = 0.012;
  const text = labelDecal(label, { size: radius * 1.6, color: '#1d2a5c', stroke: null, padding: 4 });
  text.position.y = 0.02;
  g.add(body, band, face, text);
  g.userData.face = face;
  return shadow(g);
}

/** A star to mount on a wall for counting. */
export function makeWallStar(size = 0.42): THREE.Mesh {
  const m = new THREE.Mesh(
    starGeometry(size, size * 0.45, 0.14),
    new THREE.MeshStandardMaterial({ color: 0xffd43b, roughness: 0.3, emissive: 0xffa200, emissiveIntensity: 0.55 }),
  );
  m.castShadow = true;
  return m;
}
