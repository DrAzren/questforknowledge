import * as THREE from 'three';
import { mergeInto } from '../env/builders';

/**
 * Affan, built to match the approved reference: side-swept dark brown hair,
 * black rectangular glasses with blue temple tips, navy/white/coral striped
 * zip hoodie over a coral tee, navy joggers and white/coral sneakers.
 *
 * The rig is a small hand-built skeleton (shoulders, elbows-as-one, hips, neck)
 * driven by a pose blender, which gives every animation in the brief plus
 * facial expressions (brows, blinking eyes, swappable mouth shapes).
 */

export type Emote =
  | 'none' | 'celebrate' | 'think' | 'surprised' | 'sad' | 'victory' | 'wave';

export type Expression = 'happy' | 'neutral' | 'joy' | 'surprised' | 'sad' | 'think';

export interface LocomotionState {
  speed: number;
  grounded: boolean;
  vy: number;
  running: boolean;
}

const C = {
  skin: 0xf4b78c,
  skinDark: 0xe39a6c,
  hair: 0x35251c,
  navy: 0x27356e,
  white: 0xf4f1ea,
  coral: 0xf0715f,
  coralTee: 0xf58f78,
  shoe: 0xf7f5f0,
  glasses: 0x1c1c20,
  blue: 0x2f7fe0,
};

interface Pose {
  armLx: number; armLz: number;
  armRx: number; armRz: number;
  foreL: number; foreR: number;
  legL: number; legR: number;
  kneeL: number; kneeR: number;
  lean: number; twist: number;
  headX: number; headZ: number; headY: number;
  y: number; squash: number;
}

const REST: Pose = {
  armLx: 0, armLz: 0.16, armRx: 0, armRz: -0.16, foreL: 0.15, foreR: 0.15,
  legL: 0, legR: 0, kneeL: 0, kneeR: 0, lean: 0, twist: 0,
  headX: 0, headZ: 0, headY: 0, y: 0, squash: 1,
};

function std(color: number, roughness = 0.75): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

function mouthTexture(kind: Expression): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = '#7a3324';
  g.lineWidth = 7;
  const drawOpen = (w: number, h: number, tongue: boolean): void => {
    g.fillStyle = '#7a2a22';
    g.beginPath();
    g.ellipse(64, 44, w, h, 0, 0, Math.PI * 2);
    g.fill();
    if (tongue) {
      g.save();
      g.beginPath();
      g.ellipse(64, 44, w, h, 0, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = '#f08a8a';
      g.beginPath();
      g.ellipse(64, 44 + h * 0.75, w * 0.7, h * 0.6, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.fillRect(64 - w, 44 - h, w * 2, h * 0.42);
      g.restore();
    }
  };
  switch (kind) {
    case 'happy':
      g.beginPath();
      g.arc(64, 22, 34, Math.PI * 0.18, Math.PI * 0.82);
      g.stroke();
      break;
    case 'joy':
      // Wide open smile: a half-moon.
      g.fillStyle = '#7a2a22';
      g.beginPath();
      g.moveTo(26, 30);
      g.quadraticCurveTo(64, 96, 102, 30);
      g.quadraticCurveTo(64, 40, 26, 30);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(34, 33);
      g.quadraticCurveTo(64, 42, 94, 33);
      g.quadraticCurveTo(64, 50, 34, 33);
      g.fill();
      g.fillStyle = '#f08a8a';
      g.beginPath();
      g.ellipse(64, 66, 18, 9, 0, 0, Math.PI * 2);
      g.fill();
      break;
    case 'surprised':
      drawOpen(15, 20, false);
      break;
    case 'sad':
      g.beginPath();
      g.arc(64, 78, 30, Math.PI * 1.22, Math.PI * 1.78);
      g.stroke();
      break;
    case 'think':
      g.beginPath();
      g.moveTo(44, 48);
      g.quadraticCurveTo(64, 40, 88, 50);
      g.stroke();
      break;
    default:
      g.beginPath();
      g.moveTo(42, 46);
      g.quadraticCurveTo(64, 54, 86, 46);
      g.stroke();
      break;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function hoodieTexture(): THREE.CanvasTexture {
  // Wrapped around the torso: u=0.5 is the chest centre.
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  const css = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
  // Hoodie bands, top to bottom: navy shoulders, white, coral, white, navy body, hem stripes.
  g.fillStyle = css(C.navy);
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = css(C.white);
  g.fillRect(0, 52, 256, 34);
  g.fillStyle = css(C.coral);
  g.fillRect(0, 86, 256, 26);
  g.fillStyle = css(C.white);
  g.fillRect(0, 112, 256, 18);
  g.fillStyle = css(C.white);
  g.fillRect(0, 232, 256, 6);
  g.fillRect(0, 244, 256, 6);
  // Open front showing the coral tee.
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#f79a84');
  grad.addColorStop(1, '#ee7f69');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(108, 0);
  g.lineTo(148, 0);
  g.lineTo(140, 256);
  g.lineTo(116, 256);
  g.closePath();
  g.fill();
  // Zip edges.
  g.strokeStyle = '#d9d6cf';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(108, 0);
  g.lineTo(116, 256);
  g.moveTo(148, 0);
  g.lineTo(140, 256);
  g.stroke();
  // Drawstrings.
  g.strokeStyle = css(C.navy);
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(102, 10);
  g.lineTo(104, 92);
  g.moveTo(154, 10);
  g.lineTo(152, 92);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sleeveTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 128;
  const g = c.getContext('2d')!;
  const css = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
  g.fillStyle = css(C.navy);
  g.fillRect(0, 0, 32, 128);
  g.fillStyle = css(C.white);
  g.fillRect(0, 44, 32, 14);
  g.fillStyle = css(C.coral);
  g.fillRect(0, 58, 32, 44);
  g.fillStyle = css(C.navy);
  g.fillRect(0, 102, 32, 26);
  g.fillStyle = css(C.white);
  g.fillRect(0, 108, 32, 4);
  g.fillRect(0, 118, 32, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Affan {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private foreL = new THREE.Group();
  private foreR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private shinL = new THREE.Group();
  private shinR = new THREE.Group();
  private eyeL = new THREE.Group();
  private eyeR = new THREE.Group();
  private browL!: THREE.Mesh;
  private browR!: THREE.Mesh;
  private mouth!: THREE.Mesh;
  private mouths = new Map<Expression, THREE.CanvasTexture>();
  /** Transparent face details (cheeks, lenses) that must stay separate meshes. */
  private faceOverlays: THREE.Object3D[] = [];

  private pose: Pose = { ...REST };
  private target: Pose = { ...REST };
  private phase = 0;
  private time = 0;
  private blink = 2;
  private emote: Emote = 'none';
  private emoteTime = 0;
  private emoteDuration = 0;
  private landTimer = 0;
  private expression: Expression = 'happy';
  private baseExpression: Expression = 'happy';
  /** Current animation name, exposed for the HUD and automated tests. */
  animation = 'idle';
  /** Fires on each footfall so the game can play a step sound. */
  onStep: (() => void) | null = null;
  private lastStepSide = 0;

  constructor() {
    this.build();
    // Each joint's rigid parts collapse to one mesh per material (about 90 meshes become about 35).
    mergeInto(this.head, [this.eyeL, this.eyeR, this.browL, this.browR, this.mouth, ...this.faceOverlays]);
    mergeInto(this.shinL);
    mergeInto(this.shinR);
    mergeInto(this.foreL);
    mergeInto(this.foreR);
    mergeInto(this.legL, [this.shinL]);
    mergeInto(this.legR, [this.shinR]);
    mergeInto(this.armL, [this.foreL]);
    mergeInto(this.armR, [this.foreR]);
    mergeInto(this.torso, [this.head, this.armL, this.armR]);
  }

  // ---- Model ------------------------------------------------------------------

  private build(): void {
    const skin = new THREE.MeshStandardMaterial({ color: C.skin, roughness: 0.6, emissive: 0x5a2a14, emissiveIntensity: 0.3 });
    const navy = std(C.navy, 0.85);
    this.root.add(this.body);

    // Legs (hips at 0.44).
    const makeLeg = (side: number, leg: THREE.Group, shin: THREE.Group): void => {
      leg.position.set(side * 0.105, 0.44, 0);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.088, 0.1, 4, 12), navy);
      thigh.position.y = -0.11;
      leg.add(thigh);
      shin.position.y = -0.21;
      const calf = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.08, 4, 12), navy);
      calf.position.y = -0.08;
      shin.add(calf);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.072, 0.05, 14), std(0x1f2b5c));
      cuff.position.y = -0.155;
      shin.add(cuff);
      // Sneaker: white body, coral toe cap and heel, navy sole.
      const shoe = new THREE.Group();
      shoe.position.set(0, -0.2, 0.035);
      const upper = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), std(C.shoe, 0.6));
      upper.scale.set(0.95, 0.62, 1.5);
      shoe.add(upper);
      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), std(C.coral, 0.6));
      toe.scale.set(0.95, 0.5, 0.8);
      toe.position.set(0, -0.012, 0.085);
      shoe.add(toe);
      const heel = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), std(C.coral, 0.6));
      heel.scale.set(1, 0.6, 0.6);
      heel.position.set(0, 0.0, -0.1);
      shoe.add(heel);
      const sole = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.1, 0.03, 16), std(0x2b3a78, 0.9));
      sole.scale.set(0.95, 1, 1.55);
      sole.position.y = -0.052;
      shoe.add(sole);
      shin.add(shoe);
      leg.add(shin);
      this.body.add(leg);
    };
    makeLeg(-1, this.legL, this.shinL);
    makeLeg(1, this.legR, this.shinR);

    // Torso.
    this.torso.position.y = 0.44;
    this.body.add(this.torso);
    const hips = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), navy);
    hips.scale.set(1.08, 0.62, 0.9);
    hips.position.y = 0.02;
    this.torso.add(hips);
    const profile: THREE.Vector2[] = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.185, 0.0),
      new THREE.Vector2(0.2, 0.05),
      new THREE.Vector2(0.196, 0.16),
      new THREE.Vector2(0.18, 0.27),
      new THREE.Vector2(0.14, 0.335),
      new THREE.Vector2(0.07, 0.36),
      new THREE.Vector2(0.0, 0.365),
    ];
    const hoodie = new THREE.Mesh(
      new THREE.LatheGeometry(profile, 28),
      new THREE.MeshStandardMaterial({ map: hoodieTexture(), roughness: 0.9 }),
    );
    // Lathe UVs start at +Z with the texture centre at the back; turn it so the open zip faces forward.
    hoodie.rotation.y = Math.PI;
    hoodie.scale.set(1, 1, 0.84);
    hoodie.position.y = 0.02;
    this.torso.add(hoodie);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), navy);
    hood.scale.set(1.15, 0.7, 0.75);
    hood.position.set(0, 0.33, -0.1);
    this.torso.add(hood);

    // Arms.
    const sleeveMat = new THREE.MeshStandardMaterial({ map: sleeveTexture(), roughness: 0.9 });
    const makeArm = (side: number, arm: THREE.Group, fore: THREE.Group): void => {
      arm.position.set(side * 0.2, 0.31, 0);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.066, 0.1, 4, 12), navy);
      upper.position.y = -0.085;
      arm.add(upper);
      fore.position.y = -0.165;
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.06, 0.17, 14), sleeveMat);
      lower.position.y = -0.07;
      fore.add(lower);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.062, 14, 12), skin);
      hand.scale.set(0.95, 1.1, 0.85);
      hand.position.y = -0.185;
      fore.add(hand);
      const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), skin);
      thumb.position.set(-side * 0.04, -0.17, 0.035);
      fore.add(thumb);
      arm.add(fore);
      this.torso.add(arm);
    };
    makeArm(-1, this.armL, this.foreL);
    makeArm(1, this.armR, this.foreR);

    // Neck + head.
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 12), std(C.skinDark, 0.7));
    neck.position.y = 0.39;
    this.torso.add(neck);
    this.head.position.y = 0.42;
    this.torso.add(this.head);
    this.buildHead(skin);
  }

  private buildHead(skin: THREE.MeshStandardMaterial): void {
    const R = 0.27;
    const cy = 0.24;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 24), skin);
    skull.scale.set(1, 0.96, 0.95);
    skull.position.y = cy;
    this.head.add(skull);
    // Soft cheeks/jaw to round the face like the reference.
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(R * 0.86, 24, 16), skin);
    jaw.scale.set(1.02, 0.7, 0.9);
    jaw.position.set(0, cy - 0.085, 0.015);
    this.head.add(jaw);

    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), skin);
      ear.scale.set(0.55, 1, 0.8);
      ear.position.set(s * 0.262, cy - 0.02, 0);
      this.head.add(ear);
      const inner = new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 8), std(C.skinDark, 0.7));
      inner.scale.set(0.4, 1, 0.8);
      inner.position.set(s * 0.278, cy - 0.02, 0.008);
      this.head.add(inner);
    }

    // Hair: a cap over the top/back, a side-swept fringe and a few tufts.
    const hairMat = std(C.hair, 0.55);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.06, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.43),
      hairMat,
    );
    cap.scale.set(1.02, 1.0, 1.0);
    cap.position.set(0, cy + 0.012, -0.012);
    cap.rotation.x = -0.5;
    this.head.add(cap);
    const back = new THREE.Mesh(new THREE.SphereGeometry(R * 1.02, 24, 16), hairMat);
    back.scale.set(1.0, 0.86, 0.7);
    back.position.set(0, cy + 0.035, -0.095);
    this.head.add(back);
    // Fringe locks sweep from the child's right (our +x is his left) across the forehead.
    const fringe: [number, number, number, number, number, number, number][] = [
      // x, y, z, sx, sy, rotZ, rotY
      [0.14, 0.2, 0.17, 1.35, 0.5, -0.62, 0.55],
      [0.05, 0.222, 0.205, 1.45, 0.5, -0.42, 0.2],
      [-0.045, 0.214, 0.208, 1.35, 0.48, -0.26, -0.15],
      [-0.13, 0.19, 0.178, 1.15, 0.46, -0.05, -0.55],
      [-0.215, 0.13, 0.095, 0.8, 0.7, 0.5, -1.1],
      [0.222, 0.14, 0.09, 0.8, 0.75, -0.9, 1.1],
    ];
    for (const [x, y, z, sx, sy, rz, ry] of fringe) {
      const lock = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), hairMat);
      lock.scale.set(sx, sy, 0.62);
      lock.position.set(x, cy + y, z);
      lock.rotation.set(0, ry, rz);
      this.head.add(lock);
    }
    const tufts: [number, number, number, number, number][] = [
      [0.06, 0.3, 0.02, -0.5, 0.2],
      [-0.03, 0.31, -0.03, 0.25, -0.2],
      [0.13, 0.27, -0.02, -0.9, 0.1],
    ];
    for (const [x, y, z, rz, rx] of tufts) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.11, 8), hairMat);
      tuft.position.set(x, cy + y, z);
      tuft.rotation.set(rx, 0, rz);
      this.head.add(tuft);
    }

    // Eyes.
    const eyeZ = 0.228;
    const makeEye = (side: number, group: THREE.Group): void => {
      group.position.set(side * 0.098, cy - 0.012, eyeZ);
      group.rotation.y = side * 0.2;
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.058, 20, 16), std(0xffffff, 0.3));
      white.scale.set(1, 1.08, 0.42);
      group.add(white);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.039, 18, 14), std(0x4a2a18, 0.3));
      iris.scale.set(1, 1.05, 0.4);
      iris.position.set(0, -0.002, 0.018);
      group.add(iris);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.021, 12, 10), std(0x100806, 0.3));
      pupil.scale.set(1, 1, 0.4);
      pupil.position.set(0, -0.002, 0.03);
      group.add(pupil);
      const glint = new THREE.Mesh(
        new THREE.SphereGeometry(0.011, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      glint.position.set(0.014, 0.016, 0.037);
      group.add(glint);
      this.head.add(group);
    };
    makeEye(-1, this.eyeL);
    makeEye(1, this.eyeR);

    const browGeo = new THREE.CapsuleGeometry(0.012, 0.065, 4, 8);
    const browMat = std(C.hair, 0.6);
    this.browL = new THREE.Mesh(browGeo, browMat);
    this.browR = new THREE.Mesh(browGeo, browMat);
    this.browL.position.set(-0.1, cy + 0.074, 0.24);
    this.browR.position.set(0.1, cy + 0.074, 0.24);
    this.browL.rotation.z = Math.PI / 2;
    this.browR.rotation.z = Math.PI / 2;
    this.head.add(this.browL, this.browR);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), std(C.skinDark, 0.6));
    nose.scale.set(1.1, 0.8, 0.8);
    nose.position.set(0, cy - 0.066, 0.252);
    this.head.add(nose);

    for (const s of [-1, 1]) {
      const cheek = new THREE.Mesh(
        new THREE.CircleGeometry(0.036, 16),
        new THREE.MeshBasicMaterial({ color: 0xf28d7c, transparent: true, opacity: 0.26, depthWrite: false }),
      );
      cheek.position.set(s * 0.158, cy - 0.088, 0.196);
      cheek.rotation.y = s * 0.62;
      this.head.add(cheek);
      this.faceOverlays.push(cheek);
    }

    for (const e of ['happy', 'neutral', 'joy', 'surprised', 'sad', 'think'] as Expression[]) {
      this.mouths.set(e, mouthTexture(e));
    }
    this.mouth = new THREE.Mesh(
      new THREE.PlaneGeometry(0.15, 0.1125),
      new THREE.MeshBasicMaterial({ map: this.mouths.get('happy')!, transparent: true, depthWrite: false }),
    );
    this.mouth.position.set(0, cy - 0.135, 0.243);
    this.mouth.rotation.x = 0.18;
    this.head.add(this.mouth);

    // Glasses: black rectangular frames, blue tips on the temple arms.
    const frameMat = std(C.glasses, 0.35);
    const lensW = 0.15;
    const lensH = 0.118;
    const rim = 0.016;
    const shape = new THREE.Shape();
    const rr = (s: THREE.Shape | THREE.Path, w: number, h: number, r: number): void => {
      s.moveTo(-w / 2 + r, -h / 2);
      s.lineTo(w / 2 - r, -h / 2);
      s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
      s.lineTo(w / 2, h / 2 - r);
      s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
      s.lineTo(-w / 2 + r, h / 2);
      s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
      s.lineTo(-w / 2, -h / 2 + r);
      s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    };
    rr(shape, lensW, lensH, 0.03);
    const hole = new THREE.Path();
    rr(hole, lensW - rim * 2, lensH - rim * 2, 0.02);
    shape.holes.push(hole);
    const frameGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.014, bevelEnabled: false, curveSegments: 6 });
    const glasses = new THREE.Group();
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(frameGeo, frameMat);
      f.position.set(s * 0.098, 0, 0);
      f.rotation.y = s * 0.17;
      glasses.add(f);
      const lens = new THREE.Mesh(
        new THREE.PlaneGeometry(lensW - rim * 2, lensH - rim * 2),
        new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.1, depthWrite: false }),
      );
      lens.position.set(s * 0.098, 0, 0.006);
      lens.rotation.y = s * 0.17;
      glasses.add(lens);
      this.faceOverlays.push(lens);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.016, 0.24), frameMat);
      arm.position.set(s * 0.196, 0.02, -0.125);
      arm.rotation.y = s * -0.2;
      glasses.add(arm);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.022, 0.07), std(C.blue, 0.4));
      tip.position.set(s * 0.19, 0.02, -0.03);
      tip.rotation.y = s * -0.2;
      glasses.add(tip);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.014, 0.014), frameMat);
    bridge.position.set(0, 0.012, 0.012);
    glasses.add(bridge);
    glasses.position.set(0, cy - 0.016, 0.262);
    this.head.add(glasses);
  }

  // ---- Animation --------------------------------------------------------------

  /** Trigger a timed emote animation (celebrate, think, surprised, sad, victory, wave). */
  play(emote: Emote, duration = 1.6): void {
    this.emote = emote;
    this.emoteTime = 0;
    this.emoteDuration = duration;
  }

  get currentEmote(): Emote {
    return this.emote;
  }

  setExpression(e: Expression): void {
    this.baseExpression = e;
  }

  /** Call when the body lands so the squash-and-stretch plays. */
  notifyLanded(): void {
    this.landTimer = 0.22;
  }

  update(dt: number, loco: LocomotionState): void {
    this.time += dt;
    const t = this.target;
    Object.assign(t, REST);
    let expr: Expression = this.baseExpression;
    let name = 'idle';
    const s = Math.sin;
    const T = this.time;

    if (this.emote !== 'none') {
      this.emoteTime += dt;
      if (this.emoteTime >= this.emoteDuration) this.emote = 'none';
    }
    if (this.landTimer > 0) this.landTimer -= dt;

    if (!loco.grounded && this.emote !== 'victory') {
      if (loco.vy > 0.5) {
        name = 'jump';
        t.armLx = -0.5; t.armLz = 2.2;
        t.armRx = -0.5; t.armRz = -2.2;
        t.legL = 0.75; t.kneeL = -1.25;
        t.legR = -0.25; t.kneeR = -0.7;
        t.lean = -0.08;
        t.squash = 1.07;
        expr = 'joy';
      } else {
        name = 'fall';
        const flail = s(T * 18) * 0.35;
        t.armLx = flail; t.armLz = 2.05 + flail * 0.3;
        t.armRx = -flail; t.armRz = -2.05 + flail * 0.3;
        t.legL = 0.3 + flail * 0.5; t.kneeL = -0.5;
        t.legR = 0.3 - flail * 0.5; t.kneeR = -0.5;
        t.lean = 0.1;
        expr = loco.vy < -9 ? 'surprised' : 'happy';
      }
    } else if (this.emote === 'celebrate') {
      name = 'celebrate';
      const b = Math.abs(s(T * 9));
      t.y = b * 0.16;
      t.armLz = 2.55 + s(T * 14) * 0.25;
      t.armRz = -2.55 - s(T * 14 + 1) * 0.25;
      t.legL = b * 0.25; t.kneeL = -b * 0.5;
      t.legR = b * 0.25; t.kneeR = -b * 0.5;
      t.headX = -0.15;
      expr = 'joy';
    } else if (this.emote === 'victory') {
      name = 'victory';
      const sway = s(T * 6);
      t.y = Math.abs(s(T * 6)) * 0.1;
      t.twist = sway * 0.5;
      t.lean = 0;
      t.armLz = 1.4 + sway * 1.0; t.armLx = -0.3;
      t.armRz = -1.4 + sway * 1.0; t.armRx = -0.3;
      t.foreL = 0.9; t.foreR = 0.9;
      t.legL = Math.max(0, sway) * 0.5; t.kneeL = -Math.max(0, sway) * 0.8;
      t.legR = Math.max(0, -sway) * 0.5; t.kneeR = -Math.max(0, -sway) * 0.8;
      t.headZ = sway * 0.18;
      expr = 'joy';
    } else if (this.emote === 'think') {
      name = 'think';
      t.armRx = -1.25; t.armRz = 0.25; t.foreR = 2.05;
      t.armLx = -0.5; t.armLz = -0.55; t.foreL = 1.3;
      t.headZ = -0.14; t.headX = -0.08; t.headY = 0.2;
      expr = 'think';
    } else if (this.emote === 'surprised') {
      name = 'surprised';
      const k = Math.min(1, this.emoteTime * 8);
      t.armLz = 1.25 * k; t.armRz = -1.25 * k;
      t.armLx = -0.4; t.armRx = -0.4;
      t.lean = -0.16; t.headX = -0.12;
      t.y = Math.max(0, s(Math.min(this.emoteTime, 0.3) * 10.4)) * 0.12;
      expr = 'surprised';
    } else if (this.emote === 'sad') {
      name = 'sad';
      t.headX = 0.42; t.lean = 0.16;
      t.armLz = 0.05; t.armRz = -0.05;
      t.armLx = 0.12; t.armRx = 0.12;
      t.squash = 0.97;
      expr = 'sad';
    } else if (this.emote === 'wave') {
      name = 'wave';
      t.armRz = -2.5 + s(T * 10) * 0.35; t.foreR = 0.5;
      t.headZ = 0.08;
      expr = 'joy';
    } else if (loco.speed > 0.35) {
      const run = loco.running && loco.speed > 4;
      name = run ? 'run' : 'walk';
      const rate = run ? 2.6 : 2.9;
      this.phase += dt * loco.speed * rate;
      const sw = s(this.phase);
      const amp = run ? 1.0 : 0.62;
      t.legL = sw * amp; t.legR = -sw * amp;
      t.kneeL = -Math.max(0, -Math.cos(this.phase)) * (run ? 1.35 : 0.75);
      t.kneeR = -Math.max(0, Math.cos(this.phase)) * (run ? 1.35 : 0.75);
      t.armLx = -sw * amp * 0.95; t.armRx = sw * amp * 0.95;
      t.foreL = run ? 1.25 : 0.4; t.foreR = run ? 1.25 : 0.4;
      t.lean = run ? 0.24 : 0.07;
      t.y = Math.abs(Math.cos(this.phase)) * (run ? 0.07 : 0.035);
      t.twist = sw * 0.1;
      const side = sw > 0 ? 1 : -1;
      if (side !== this.lastStepSide) {
        this.lastStepSide = side;
        this.onStep?.();
      }
    } else {
      // Idle: breathing, a little sway, an occasional glance.
      t.squash = 1 + s(T * 2.2) * 0.012;
      t.headZ = s(T * 0.7) * 0.035;
      t.headY = s(T * 0.45) * 0.14;
      t.armLz = 0.16 + s(T * 2.2) * 0.02;
      t.armRz = -0.16 - s(T * 2.2) * 0.02;
    }

    if (this.landTimer > 0 && loco.grounded) {
      const k = this.landTimer / 0.22;
      t.squash = 1 - 0.2 * k;
      t.kneeL -= 0.5 * k; t.kneeR -= 0.5 * k;
      t.legL += 0.25 * k; t.legR += 0.25 * k;
      if (name === 'idle' || name === 'walk' || name === 'run') name = 'land';
    }
    this.animation = name;

    // Blend toward the target pose; fast enough to feel snappy, slow enough to hide pops.
    const k = 1 - Math.exp(-dt * 16);
    const p = this.pose;
    (Object.keys(p) as (keyof Pose)[]).forEach((key) => {
      p[key] += (t[key] - p[key]) * k;
    });

    this.body.position.y = p.y;
    this.body.scale.set(1 + (1 - p.squash) * 0.6, p.squash, 1 + (1 - p.squash) * 0.6);
    this.torso.rotation.set(p.lean, p.twist, 0);
    this.armL.rotation.set(p.armLx, 0, -p.armLz);
    this.armR.rotation.set(p.armRx, 0, -p.armRz);
    this.foreL.rotation.x = -p.foreL;
    this.foreR.rotation.x = -p.foreR;
    this.legL.rotation.x = -p.legL;
    this.legR.rotation.x = -p.legR;
    this.shinL.rotation.x = -p.kneeL;
    this.shinR.rotation.x = -p.kneeR;
    this.head.rotation.set(p.headX, p.headY, p.headZ);

    this.updateFace(dt, expr);
  }

  private updateFace(dt: number, expr: Expression): void {
    if (expr !== this.expression) {
      this.expression = expr;
      (this.mouth.material as THREE.MeshBasicMaterial).map = this.mouths.get(expr)!;
      (this.mouth.material as THREE.MeshBasicMaterial).needsUpdate = true;
    }
    this.blink -= dt;
    let lid = 1;
    if (this.blink < 0.12) lid = Math.max(0.08, Math.abs(this.blink - 0.06) / 0.06);
    if (this.blink < 0) this.blink = 2 + Math.random() * 3;
    let eyeScale = 1;
    let browY = 0;
    let browTilt = 0;
    switch (expr) {
      case 'surprised': eyeScale = 1.22; browY = 0.03; lid = 1; break;
      case 'sad': eyeScale = 0.92; browY = -0.004; browTilt = 0.38; break;
      case 'joy': eyeScale = 1.04; browY = 0.014; break;
      case 'think': browY = 0.012; browTilt = -0.2; break;
      default: break;
    }
    const k = 1 - Math.exp(-dt * 18);
    for (const eye of [this.eyeL, this.eyeR]) {
      eye.scale.x += (eyeScale - eye.scale.x) * k;
      eye.scale.y = eyeScale * lid;
    }
    const baseY = 0.24 + 0.074;
    this.browL.position.y += (baseY + browY - this.browL.position.y) * k;
    this.browR.position.y += (baseY + browY + (expr === 'think' ? 0.016 : 0) - this.browR.position.y) * k;
    // Inner ends rise for "sad", drop for "think".
    this.browL.rotation.z += (Math.PI / 2 - browTilt - this.browL.rotation.z) * k;
    this.browR.rotation.z += (Math.PI / 2 + browTilt - this.browR.rotation.z) * k;
  }
}
