import * as THREE from 'three';
import { countQuestion, randInt, shuffle } from '../../edu/questions';
import { boxCollider, discCollider } from '../../engine/Physics';
import {
  GEM_COLORS, labelSprite, makeChest, makeGem, makeRock, makeSign, mat, rng, shadow,
  type GemShape, type Updatable,
} from '../../env/builders';
import { JungleStage } from './JungleStage';

interface Gem {
  obj: Updatable;
  shape: GemShape;
  color: string;
  taken: boolean;
  /** Seconds before this gem can react again after a wrong touch. */
  cooldown: number;
  hop: number;
  baseY: number;
}

interface Task {
  kind: 'colour' | 'shape' | 'count';
  prompt: string;
  need: number;
  matches(g: Gem): boolean;
  /** [shape, colour] for every gem laid out in this round. */
  layout: [GemShape, string][];
}

const SHAPES: GemShape[] = ['bulat', 'segi empat', 'segi tiga', 'bintang'];
const SHAPE_ICON: Record<GemShape, string> = { bulat: '⚪', 'segi empat': '⬜', 'segi tiga': '🔺', bintang: '⭐' };
const COLOR_ICON: Record<string, string> = { merah: '🔴', biru: '🔵', kuning: '🟡', hijau: '🟢' };
const COLORS = Object.keys(GEM_COLORS);

/** Spots where gems can appear: [x, z, height]. Raised ones sit on rock platforms. */
const SPOTS: [number, number, number][] = [
  [-8, 4, 0], [-4.5, 6.5, 0], [0, 4.5, 0], [4.5, 6.5, 0], [8, 4, 0],
  [-9.5, -1, 0], [-5, 0.5, 0], [5, 0.5, 0], [9.5, -1, 0],
  [-7.5, -6, 0], [-3, -3.5, 0], [3, -3.5, 0], [7.5, -6, 0],
  [-6.2, 2.4, 0.9], [6.2, 2.4, 0.9], [0, -0.6, 1.2],
];

/**
 * Stage 3 - Harta Karun Hutan.
 * Three collecting tasks in a clearing: by colour, by shape, then by quantity.
 * A counting question opens the treasure chest and awards the badge.
 */
export class JungleTreasureStage extends JungleStage {
  private gems: Gem[] = [];
  private tasks: Task[] = [];
  private taskIndex = -1;
  private collected = 0;
  private between = 0;
  private chest!: Updatable;
  private chestState: 'locked' | 'ready' | 'asking' | 'open' = 'locked';
  private chestArrow!: THREE.Sprite;
  private readonly chestPos = new THREE.Vector3(0, 0, -9.5);

  build(): void {
    const rand = rng(3301);
    const g = this.game.rand;
    this.spawn.set(0, 0, 9.6);
    this.cameraOffset.set(0, 5.0, 7.4);

    this.ground(-30, 30, -26, 36, 0);
    this.wall(-13.4, -12, -14, 14);
    this.wall(12, 13.4, -14, 14);
    this.wall(-13, 13, 12.6, 14);
    this.wall(-13, 13, -14, -12.6);

    // Rock platforms that need a jump.
    for (const [x, z, h] of SPOTS) {
      if (h <= 0) continue;
      const rock = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.45, h, 9), mat(0x8d9296, 0.95, { flatShading: true }));
      body.position.y = -h / 2;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(1.27, 1.27, 0.08, 9), mat(0x69b34c, 0.95));
      top.position.y = -0.02;
      rock.add(body, top);
      shadow(rock);
      this.pillar(x, z, 1.25, h, 0, rock);
      if (h > 1) this.block(x, z + 1.9, 0.8, 0.55, 0.55, 0, 0x9a8f7a);
    }
    // A couple of logs to hop over.
    this.block(-2.2, 8.2, 1.6, 0.3, 0.5, 0, 0x8a5a33);
    this.block(6.4, -3.2, 0.3, 1.5, 0.5, 0, 0x8a5a33);

    // Treasure chest on a little stone dais at the far side of the clearing.
    const dais = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.6, 0.24, 20), mat(0xb9b2a3, 0.95));
    dais.position.set(this.chestPos.x, 0.12, this.chestPos.z);
    dais.receiveShadow = true;
    this.group.add(dais);
    this.chest = makeChest();
    this.chest.position.set(this.chestPos.x, 0.24, this.chestPos.z - 0.6);
    this.add(this.chest);
    this.collide(discCollider(this.chestPos.x, this.chestPos.z, 2.3, 0.24, 0));
    this.collide(boxCollider(this.chestPos.x, this.chestPos.z - 0.6, 0.75, 0.5, 1.0, 0.24, 'chest'));

    this.chestArrow = labelSprite('⬇', { size: 1.1, color: '#ffd43b', stroke: '#7a4b00' });
    this.chestArrow.position.set(this.chestPos.x, 3.2, this.chestPos.z - 0.6);
    this.chestArrow.visible = false;
    this.group.add(this.chestArrow);

    const sign = makeSign('Harta Karun Hutan', 4);
    sign.position.set(-6.5, 0, 10.8);
    sign.rotation.y = 0.4;
    this.decor.add(sign);

    this.checkpoint(0, 0, 9.6, 3, false);
    this.coinLine(-3, 11, 3, 11, 4);
    this.coinLine(-10.5, 8, -10.5, 2, 3);
    this.coinLine(10.5, 8, 10.5, 2, 3);

    // Tasks: a colour, then a shape, then a quantity.
    const colour = COLORS[randInt(g, 0, COLORS.length - 1)];
    const shape = SHAPES[randInt(g, 0, 2)];
    const count = randInt(g, 4, 6);
    this.tasks = [
      {
        kind: 'colour',
        prompt: `Kumpul 3 permata ${colour.toUpperCase()} ${COLOR_ICON[colour]}`,
        need: 3,
        matches: (gem) => gem.color === colour,
        layout: COLORS.flatMap((c) => Array.from({ length: c === colour ? 3 : 2 }, (): [GemShape, string] => ['bulat', c])),
      },
      {
        kind: 'shape',
        prompt: `Kumpul 3 bentuk ${shape.toUpperCase()} ${SHAPE_ICON[shape]}`,
        need: 3,
        matches: (gem) => gem.shape === shape,
        layout: SHAPES.flatMap((s, i) => Array.from({ length: s === shape ? 3 : 2 }, (_, j): [GemShape, string] => [s, COLORS[(i + j) % COLORS.length]])),
      },
      {
        kind: 'count',
        prompt: `Kumpul ${count} bintang ⭐`,
        need: count,
        matches: (gem) => gem.shape === 'bintang',
        layout: [
          ...Array.from({ length: count + 2 }, (): [GemShape, string] => ['bintang', 'kuning']),
          ['bulat', 'biru'], ['segi empat', 'merah'], ['segi tiga', 'hijau'], ['bulat', 'merah'],
        ],
      },
    ];

    // Dressing: a ring of jungle around the clearing.
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2;
      const r = 17.5 + rand() * 5;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // Leave the near side open: that is where the follow camera sits.
      if (z > 10 && Math.abs(x) < 15) continue;
      this.jungleBlob(rand, x, z);
    }
    for (let i = 0; i < 22; i++) {
      const a = rand() * Math.PI * 2;
      const rock = makeRock(rand, 0.6 + rand() * 0.6);
      rock.position.set(Math.cos(a) * 12.9, 0.1, Math.sin(a) * 12.9);
      this.decor.add(rock);
    }
    this.meadow(rand, -11.5, 11.5, -11.5, 11.5, 0, 46, 110, (x, z) => SPOTS.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 1.6) || Math.hypot(x, z + 9.5) < 2.8);
    this.butterflies(9, -10, 10, -10, 10, rand);
    this.birdPost(-10.5, -9.5, 0);
    this.birdPost(10.5, -9.5, 0, 0xff8f3c);
    this.finishDecor();

    this.startTask(0);
  }

  private jungleBlob(rand: () => number, x: number, z: number): void {
    const t = new THREE.Group();
    const h = 3.6 + rand() * 2;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.4, h, 8), mat(0x7a5230));
    trunk.position.y = h / 2;
    t.add(trunk);
    for (let i = 0; i < 4; i++) {
      const leaf = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.4 + rand() * 0.9, 1),
        mat([0x2f9e44, 0x37b24d, 0x2b8a3e, 0x40c057][i % 4], 0.9, { flatShading: true }),
      );
      leaf.position.set((rand() - 0.5) * 2.2, h + rand() * 1.3 - 0.3, (rand() - 0.5) * 2.2);
      t.add(leaf);
    }
    t.position.set(x, 0, z);
    this.decor.add(shadow(t));
  }

  private startTask(index: number): void {
    // Clear whatever is left from the previous round.
    for (const gem of this.gems) {
      if (!gem.taken) this.game.sparkles.burst(gem.obj.position, 6, [0xffffff, 0xfff3bf], 2);
      gem.obj.removeFromParent();
      const i = this.updatables.indexOf(gem.obj);
      if (i >= 0) this.updatables.splice(i, 1);
    }
    this.gems = [];
    this.taskIndex = index;
    this.collected = 0;
    const task = this.tasks[index];
    const spots = shuffle(this.game.rand, SPOTS).slice(0, task.layout.length);
    task.layout.forEach(([shape, color], i) => {
      const [x, z, h] = spots[i];
      const obj = makeGem(shape, color);
      obj.position.set(x, h + 0.75, z);
      this.add(obj);
      this.gems.push({ obj, shape, color, taken: false, cooldown: 0, hop: 0, baseY: h + 0.75 });
    });
    this.updatePanel();
  }

  private updatePanel(): void {
    const task = this.tasks[this.taskIndex];
    const dots = Array.from({ length: task.need }, (_, i) => (i < this.collected ? '●' : '○')).join(' ');
    this.game.showQuestion(task.prompt, `${dots}   ${this.collected} / ${task.need}`);
  }

  intro(): { duration: number; camera(t: number, out: { pos: THREE.Vector3; look: THREE.Vector3 }): void } {
    return {
      duration: 3.8,
      camera: (t, out) => {
        const k = Math.min(1, t / 3.8);
        const e = k * k * (3 - 2 * k);
        // Open on the treasure chest, then pull back across the clearing to Affan.
        out.pos.set(0, 3 + 4.1 * e, -3 + 22.9 * e);
        out.look.set(0, 0.8 + 0.5 * e, -9.5 + 20 * e);
      },
    };
  }

  protected tick(dt: number): void {
    const b = this.game.body;

    if (this.between > 0) {
      this.between -= dt;
      if (this.between <= 0) {
        if (this.taskIndex + 1 < this.tasks.length) {
          this.startTask(this.taskIndex + 1);
        } else {
          this.chestState = 'ready';
          this.chestArrow.visible = true;
          this.game.showQuestion('Hebat! Pergi ke peti harta! 🎁');
          this.game.say('Jom buka peti harta!', { emote: 'celebrate' });
        }
      }
    }

    for (const gem of this.gems) {
      if (gem.taken) continue;
      gem.cooldown = Math.max(0, gem.cooldown - dt);
      if (gem.hop > 0) {
        gem.hop = Math.max(0, gem.hop - dt);
        gem.obj.position.y = gem.baseY + Math.sin((1 - gem.hop / 0.5) * Math.PI) * 0.5;
        gem.obj.rotation.z = Math.sin(gem.hop * 40) * 0.25;
      } else {
        gem.obj.rotation.z = 0;
      }
      if (this.between > 0 || this.game.busy || gem.cooldown > 0) continue;
      const d = Math.hypot(gem.obj.position.x - b.x, gem.obj.position.z - b.z);
      const dy = gem.baseY - 0.75 - b.y;
      if (d < 0.85 && Math.abs(dy) < 0.8) {
        const task = this.tasks[this.taskIndex];
        if (task.matches(gem)) {
          gem.taken = true;
          gem.obj.visible = false;
          this.collected++;
          this.game.audio.sfx('coin', { rate: 1 + this.collected * 0.06 });
          this.game.sparkles.burst(gem.obj.position, 18);
          this.popNumber(String(this.collected), gem.obj.position);
          this.updatePanel();
          if (this.collected >= task.need) {
            this.game.praise(new THREE.Vector3(b.x, b.y + 1.6, b.z));
            this.game.addStar(new THREE.Vector3(b.x, b.y + 1.8, b.z));
            this.between = 1.6;
          }
        } else {
          // Not the one we want: a little hop and a kind word, nothing lost.
          gem.cooldown = 1.6;
          gem.hop = 0.5;
          this.game.audio.sfx('wrong');
          this.game.encourage();
        }
      }
    }

    // Treasure chest.
    this.chestArrow.position.y = 3.2 + Math.sin(this.time * 4) * 0.2;
    if (this.chestState === 'ready' && !this.game.busy) {
      const d = Math.hypot(b.x - this.chestPos.x, b.z - this.chestPos.z);
      if (d < 3.2) {
        this.chestState = 'asking';
        this.chestArrow.visible = false;
        this.game.hideQuestion();
        void this.game.quiz(countQuestion(this.game.rand, 6)).then(() => {
          this.chestState = 'open';
          (this.chest.userData as { open: () => void }).open();
          this.game.audio.sfx('achievement');
          const at = new THREE.Vector3(this.chestPos.x, 1.6, this.chestPos.z - 0.6);
          this.game.sparkles.burst(at, 70, [0xffd43b, 0xffe066, 0xfff3bf, 0xff922b], 6);
          this.finished = true;
          window.setTimeout(() => this.game.completeStage(), 1400);
        });
      }
    }
  }

  /** A big number floats up as each item is collected, so children count along. */
  private popNumber(text: string, at: THREE.Vector3): void {
    const s = labelSprite(text, { size: 1.2, color: '#ffffff', stroke: '#e8590c' }) as THREE.Sprite & Updatable;
    s.position.set(at.x, at.y + 0.6, at.z);
    let life = 0;
    s.userData.update = (dt: number) => {
      life += dt;
      s.position.y += dt * 1.4;
      s.material.opacity = Math.max(0, 1 - life / 0.9);
      if (life > 0.9) {
        s.removeFromParent();
        const i = this.updatables.indexOf(s);
        if (i >= 0) this.updatables.splice(i, 1);
      }
    };
    this.add(s);
  }
}
