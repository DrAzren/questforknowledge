import * as THREE from 'three';
import { labelDecal, labelTexture, mat, mergeInto, shadow, type Updatable } from './builders';

/** Scenery and props for the magic school world. */

export const SCHOOL_COLORS = [0xff6b6b, 0x4dabf7, 0xffd43b, 0x69db7c, 0xda77f2, 0xff922b];
export const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const css = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A toy alphabet block: a coloured cube with a letter on top and on its front. */
export function makeLetterBlock(letter: string, color: number, size = 1.7, height = 0.7): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(size, height, size), mat(color, 0.7));
  body.position.y = -height / 2;
  const trimTop = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 0.84, size * 0.84),
    new THREE.MeshBasicMaterial({ color: 0xfffbea, polygonOffset: true, polygonOffsetFactor: -1 }),
  );
  trimTop.rotation.x = -Math.PI / 2;
  trimTop.position.y = 0.012;
  const top = labelDecal(letter, { size: size * 0.95, color: '#1d2a5c', stroke: null, padding: 6 });
  top.position.y = 0.02;
  const { tex, aspect } = labelTexture(letter, { color: '#ffffff', stroke: '#1d2a5c', padding: 6 });
  const fh = Math.min(height * 0.95, size * 0.8);
  const front = new THREE.Mesh(
    new THREE.PlaneGeometry(fh * aspect, fh),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, polygonOffset: true, polygonOffsetFactor: -1 }),
  );
  front.position.set(0, -height / 2, size / 2 + 0.005);
  g.add(body, trimTop, top, front);
  g.userData.face = trimTop;
  return shadow(g);
}

/** A chalkboard in a wooden frame. `setText` rewrites what is chalked on it. */
export function makeBlackboard(width: number, height: number, text = ''): THREE.Group & { userData: { setText(t: string, sub?: string): void } } {
  const g = new THREE.Group() as THREE.Group & { userData: { setText(t: string, sub?: string): void } };
  const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, height + 0.3, 0.16), mat(0xb9834a, 0.8));
  g.add(frame);
  const tray = new THREE.Mesh(new THREE.BoxGeometry(width * 0.7, 0.08, 0.26), mat(0x9a6b3c, 0.8));
  tray.position.set(0, -height / 2 - 0.12, 0.12);
  g.add(tray);
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = Math.round((512 * height) / width);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: tex }));
  board.position.z = 0.085;
  g.add(board);
  g.userData.setText = (t: string, sub?: string) => {
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#2f5d50';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 40; i++) ctx.fillRect((i * 97) % c.width, (i * 53) % c.height, 60, 3);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fdfdf5';
    const big = sub ? c.height * 0.56 : c.height * 0.74;
    ctx.font = `800 ${big}px "Baloo 2", "Trebuchet MS", sans-serif`;
    ctx.fillText(t, c.width / 2, sub ? c.height * 0.4 : c.height * 0.54);
    if (sub) {
      ctx.fillStyle = '#ffe066';
      ctx.font = `700 ${c.height * 0.2}px "Baloo 2", "Trebuchet MS", sans-serif`;
      ctx.fillText(sub, c.width / 2, c.height * 0.83);
    }
    tex.needsUpdate = true;
  };
  g.userData.setText(text);
  frame.castShadow = true;
  return g;
}

/** A giant colouring pencil standing on its flat end, point up. */
export function makePencil(height: number, color: number, radius = 0.26): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height * 0.72, 6), mat(color, 0.6));
  body.position.y = height * 0.36;
  const wood = new THREE.Mesh(new THREE.ConeGeometry(radius, height * 0.2, 6), mat(0xf1cf9a, 0.8));
  wood.position.y = height * 0.82;
  const lead = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.42, height * 0.085, 6), mat(color, 0.5));
  lead.position.y = height * 0.9 + height * 0.02;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.04, radius * 1.04, height * 0.05, 6), mat(0xdee2e6, 0.4));
  band.position.y = height * 0.03;
  g.add(body, wood, lead, band);
  return g;
}

/** A neat pile of books to climb on. Its top surface is at y = 0; the pile extends down by `height`. */
export function makeBookStack(rand: () => number, height: number, size = 1.9): THREE.Group {
  const g = new THREE.Group();
  const n = Math.max(2, Math.round(height / 0.24));
  const th = height / n;
  for (let i = 0; i < n; i++) {
    const w = size * (0.9 + rand() * 0.12);
    const d = size * (0.72 + rand() * 0.12);
    const book = new THREE.Group();
    const cover = new THREE.Mesh(new THREE.BoxGeometry(w, th * 0.96, d), mat(SCHOOL_COLORS[Math.floor(rand() * SCHOOL_COLORS.length)], 0.7));
    const pages = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, th * 0.7, d * 0.97), mat(0xfffbea, 0.9));
    pages.position.x = w * 0.03;
    book.add(cover, pages);
    book.position.y = -height + th * (i + 0.5);
    book.rotation.y = (rand() - 0.5) * 0.35;
    g.add(book);
  }
  return shadow(g);
}

/** A big closed storybook that floats as a platform. Top surface at y = 0. */
export function makeBookPlatform(size: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const cover = new THREE.Mesh(new THREE.BoxGeometry(size, 0.4, size), mat(color, 0.7));
  cover.position.y = -0.2;
  const pages = new THREE.Mesh(new THREE.BoxGeometry(size * 0.97, 0.28, size * 0.97), mat(0xfffbea, 0.9));
  pages.position.set(size * 0.025, -0.2, 0);
  const title = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 0.62, size * 0.3),
    new THREE.MeshBasicMaterial({ color: 0xfff3bf, polygonOffset: true, polygonOffsetFactor: -1 }),
  );
  title.rotation.x = -Math.PI / 2;
  title.position.y = 0.012;
  const star = labelDecal('★', { size: size * 0.28, color: css(color), stroke: null, padding: 2 });
  star.position.y = 0.02;
  g.add(cover, pages, title, star);
  return shadow(g);
}

/** A tall shelf packed with colourful books. Stands on the ground, facing +z. */
export function makeBookshelf(rand: () => number, width: number, height: number): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0xa9744a, 0.8);
  const back = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.5), wood);
  back.position.y = height / 2;
  g.add(back);
  const rows = Math.floor(height / 0.95);
  for (let r = 0; r < rows; r++) {
    const y = 0.25 + r * 0.95;
    let x = -width / 2 + 0.2;
    while (x < width / 2 - 0.3) {
      const w = 0.12 + rand() * 0.14;
      const h = 0.5 + rand() * 0.28;
      const book = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.36), mat(SCHOOL_COLORS[Math.floor(rand() * SCHOOL_COLORS.length)], 0.7));
      book.position.set(x + w / 2, y + h / 2, 0.14);
      g.add(book);
      x += w + 0.015;
    }
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(width, 0.07, 0.62), wood);
    shelf.position.set(0, y - 0.04, 0.06);
    g.add(shelf);
  }
  return shadow(g);
}

/** A cheerful schoolhouse for the skyline. */
export function makeSchoolhouse(width: number, color = 0xffc078): THREE.Group {
  const g = new THREE.Group();
  const h = width * 0.5;
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, h, width * 0.5), mat(color, 0.9));
  body.position.y = h / 2;
  g.add(body);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, width * 0.42, h * 0.5, 4), mat(0xe8590c, 0.9, { flatShading: true }));
  roof.scale.set(1.45, 1, 0.78);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = h + h * 0.25;
  g.add(roof);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(width * 0.16, h * 0.7, width * 0.16), mat(0xfff3bf, 0.9));
  tower.position.y = h + h * 0.5;
  g.add(tower);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(width * 0.15, h * 0.35, 4), mat(0x1c7ed6, 0.9, { flatShading: true }));
  cap.rotation.y = Math.PI / 4;
  cap.position.y = h + h * 1.02;
  g.add(cap);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(width * 0.055, 20), mat(0xffffff, 0.5));
  clock.position.set(0, h + h * 0.6, width * 0.081);
  g.add(clock);
  for (let i = 0; i < 5; i++) {
    if (i === 2) continue;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.1, h * 0.3), mat(0x74c0fc, 0.3));
    win.position.set((i - 2) * width * 0.19, h * 0.58, width * 0.251);
    g.add(win);
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.14, h * 0.5), mat(0x9a6b3c, 0.8));
  door.position.set(0, h * 0.25, width * 0.251);
  g.add(door);
  return g;
}

/** A wall poster: ABC, 123 or shapes. */
export function makePoster(kind: 'abc' | '123' | 'shapes', size = 1.6): THREE.Mesh {
  const tex = canvasTexture(256, 320, (g) => {
    g.fillStyle = '#fffbea';
    g.fillRect(0, 0, 256, 320);
    g.lineWidth = 12;
    g.strokeStyle = kind === 'abc' ? '#ff6b6b' : kind === '123' ? '#4dabf7' : '#69db7c';
    g.strokeRect(6, 6, 244, 308);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '800 92px "Baloo 2", "Trebuchet MS", sans-serif';
    const cols = ['#ff6b6b', '#4dabf7', '#f59f00'];
    if (kind === 'shapes') {
      g.fillStyle = cols[0];
      g.beginPath();
      g.arc(128, 78, 44, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = cols[1];
      g.fillRect(84, 138, 88, 72);
      g.fillStyle = cols[2];
      g.beginPath();
      g.moveTo(128, 226);
      g.lineTo(178, 298);
      g.lineTo(78, 298);
      g.closePath();
      g.fill();
    } else {
      const chars = kind === 'abc' ? ['A', 'B', 'C'] : ['1', '2', '3'];
      chars.forEach((ch, i) => {
        g.fillStyle = cols[i];
        g.fillText(ch, 128, 66 + i * 96);
      });
    }
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(size, size * 1.25), new THREE.MeshBasicMaterial({ map: tex }));
}

/** A striped beach ball. */
export function makeBeachBall(radius: number): THREE.Mesh {
  const tex = canvasTexture(256, 64, (g) => {
    const cols = ['#ff6b6b', '#ffffff', '#4dabf7', '#ffffff', '#ffd43b', '#ffffff'];
    cols.forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect((i * 256) / 6, 0, 256 / 6 + 1, 64);
    });
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 14), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 }));
  m.castShadow = true;
  return m;
}

/** A pool of plastic balls, drawn in one call. */
export function makeBallPitBalls(minX: number, maxX: number, minZ: number, maxZ: number, y: number, rand: () => number): THREE.InstancedMesh {
  const area = (maxX - minX) * (maxZ - minZ);
  const count = Math.min(520, Math.floor(area * 3.2));
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 9, 7), new THREE.MeshStandardMaterial({ roughness: 0.4 }), count);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    m4.makeTranslation(minX + rand() * (maxX - minX), y + rand() * 0.34, minZ + rand() * (maxZ - minZ));
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, col.setHex(SCHOOL_COLORS[Math.floor(rand() * SCHOOL_COLORS.length)]));
  }
  mesh.instanceColor!.needsUpdate = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A picture card on a post: a big emoji, with a name plate that can be revealed. */
export function makeFlashCard(emoji: string, width = 2.2): THREE.Group & { userData: { setLabel(t: string): void; frame: THREE.Mesh } } {
  const g = new THREE.Group() as THREE.Group & { userData: { setLabel(t: string): void; frame: THREE.Mesh } };
  const height = width * 1.18;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.3, 8), mat(0xa9744a, 0.8));
  post.position.y = 0.65;
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xffd43b, roughness: 0.6 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.24, height + 0.24, 0.14), frameMat);
  frame.position.y = 1.2 + height / 2;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 302;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = (label: string): void => {
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fffbea';
    ctx.fillRect(0, 0, 256, 302);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `170px ${EMOJI_FONT}`;
    ctx.fillText(emoji, 128, label ? 122 : 156);
    if (label) {
      ctx.fillStyle = '#1d2a5c';
      ctx.font = '800 50px "Baloo 2", "Trebuchet MS", sans-serif';
      ctx.fillText(label, 128, 258);
    }
    tex.needsUpdate = true;
  };
  draw('');
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: tex }));
  face.position.set(0, 1.2 + height / 2, 0.075);
  g.add(post, frame, face);
  post.castShadow = true;
  frame.castShadow = true;
  g.userData.setLabel = draw;
  g.userData.frame = frame;
  return g;
}

/** A round, striped podium to stand on. Top surface at y = 0. */
export function makePodium(radius: number, height: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.08, height, 22), mat(color, 0.7));
  body.position.y = -height / 2;
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.03, radius * 1.06, height * 0.22, 22), mat(0xffffff, 0.7));
  stripe.position.y = -height * 0.55;
  const top = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.86, 28),
    new THREE.MeshBasicMaterial({ color: 0xfffbea, polygonOffset: true, polygonOffsetFactor: -1 }),
  );
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.012;
  g.add(body, stripe, top);
  g.userData.face = top;
  return shadow(g);
}

/** White picket fence panel, `width` long, centred on the origin, standing on the ground. */
export function makePicketFence(width: number, height = 1.1): THREE.Group {
  const g = new THREE.Group();
  const white = mat(0xffffff, 0.8);
  const n = Math.max(2, Math.round(width / 0.36));
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, height, 0.07), white);
    p.position.set((i / (n - 1) - 0.5) * (width - 0.2), height / 2, 0);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.142, 0.2, 4), white);
    tip.rotation.y = Math.PI / 4;
    tip.scale.z = 0.35;
    tip.position.set(p.position.x, height + 0.1, 0);
    g.add(p, tip);
  }
  for (const y of [height * 0.3, height * 0.72]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.1, 0.05), white);
    rail.position.set(0, y, -0.05);
    g.add(rail);
  }
  mergeInto(g);
  return g;
}

/** A lily pad with a flower, floating as a platform. Top surface at y = 0. */
export function makeLilyPad(radius: number): THREE.Group {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.94, 0.16, 22, 1, false, 0.25, Math.PI * 2 - 0.5), mat(0x40c057, 0.8));
  pad.position.y = -0.08;
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.45, radius * 0.52, 24), mat(0x2f9e44, 0.8));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.006;
  const flower = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), mat(0xff8fb1, 0.6));
  flower.position.set(radius * 0.6, 0.12, -radius * 0.5);
  flower.scale.y = 0.6;
  g.add(pad, ring, flower);
  return shadow(g);
}

/** An easel holding a picture card and, underneath, the word being built. */
export function makeEasel(emoji: string): THREE.Group & { userData: { setWord(t: string): void } } {
  const g = new THREE.Group() as THREE.Group & { userData: { setWord(t: string): void } };
  const wood = mat(0xa9744a, 0.8);
  for (const [x, rz] of [[-0.9, 0.16], [0.9, -0.16]] as [number, number][]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.6, 6), wood);
    leg.position.set(x, 1.75, 0);
    leg.rotation.z = rz;
    g.add(leg);
  }
  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.6, 6), wood);
  back.position.set(0, 1.7, -0.7);
  back.rotation.x = -0.4;
  g.add(back);
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 384;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = (word: string): void => {
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fffbea';
    ctx.fillRect(0, 0, 384, 384);
    ctx.strokeStyle = '#4dabf7';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, 370, 370);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `190px ${EMOJI_FONT}`;
    ctx.fillText(emoji, 192, 140);
    ctx.fillStyle = '#1d2a5c';
    ctx.font = '800 92px "Baloo 2", "Trebuchet MS", sans-serif';
    ctx.fillText(word, 192, 310);
    tex.needsUpdate = true;
  };
  draw('');
  const board = new THREE.Mesh(new THREE.BoxGeometry(3.0, 3.0, 0.1), mat(0xffffff, 0.8));
  board.position.set(0, 2.5, 0.12);
  board.rotation.x = -0.1;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(2.86, 2.86), new THREE.MeshBasicMaterial({ map: tex }));
  face.position.set(0, 2.5, 0.185);
  face.rotation.x = -0.1;
  g.add(board, face);
  shadow(g);
  g.userData.setWord = draw;
  return g;
}

/** A spinning playground post with a bar. The stage adds the beads on its ends as moving obstacles. */
export function makeSpinnerPost(armRadius: number): Updatable & { userData: { arm: THREE.Group } } {
  const g = new THREE.Group() as unknown as Updatable & { userData: { arm: THREE.Group } };
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.5, 12), mat(0x4dabf7, 0.5));
  post.position.y = 0.75;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.16, 16), mat(0xffd43b, 0.6));
  base.position.y = 0.08;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), mat(0xff6b6b, 0.5));
  knob.position.y = 1.56;
  const arm = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, armRadius * 2, 8), mat(0xffffff, 0.5));
  bar.rotation.z = Math.PI / 2;
  arm.add(bar);
  arm.position.y = 0.72;
  g.add(post, base, knob, arm);
  shadow(g);
  g.userData.arm = arm;
  return g;
}

/** Hopscotch squares painted on the floor. */
export function makeHopscotch(): THREE.Group {
  const g = new THREE.Group();
  const layout: [number, number][] = [[0, 0], [0, 1], [-0.5, 2], [0.5, 2], [0, 3], [-0.5, 4], [0.5, 4], [0, 5]];
  layout.forEach(([x, row], i) => {
    const tile = new THREE.Mesh(
      new THREE.PlaneGeometry(0.92, 0.92),
      new THREE.MeshBasicMaterial({ color: SCHOOL_COLORS[i % SCHOOL_COLORS.length], transparent: true, opacity: 0.75, polygonOffset: true, polygonOffsetFactor: -1 }),
    );
    tile.rotation.x = -Math.PI / 2;
    tile.position.set(x, 0.012, -row);
    const num = labelDecal(String(i + 1), { size: 0.7, color: '#ffffff', stroke: null, padding: 4 });
    num.position.set(x, 0.02, -row);
    g.add(tile, num);
  });
  return g;
}
