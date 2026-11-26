import * as THREE from 'three';
import { Affan, type Emote } from '../character/Affan';
import { ENCOURAGE_LINES, PRAISE_LINES, pick, type ChoiceQuestion } from '../edu/questions';
import { makeSky, Sparkles } from '../env/builders';
import { Hud } from '../ui/Hud';
import { WORLDS } from '../worlds';
import type { GameApi, StageBase, WorldDef, WorldTheme } from '../worlds/Stage';
import { AudioManager } from './Audio';
import { Input } from './Input';
import { CharacterBody, PhysicsWorld } from './Physics';
import { loadSave, storeSave, type SaveData } from './Save';

type Mode = 'menu' | 'intro' | 'play' | 'paused' | 'complete';

const MAX_HEARTS = 3;
const STEP = 1 / 120;

/** The game shell: rendering, the main loop, rules (hearts, rewards, progress) and screen flow. */
export class Game implements GameApi {
  readonly scene = new THREE.Scene();
  readonly physics = new PhysicsWorld();
  readonly body = new CharacterBody(this.physics);
  readonly affan = new Affan();
  readonly audio = new AudioManager();
  readonly sparkles = new Sparkles();
  readonly input: Input;
  readonly hud: Hud;
  rand: () => number = Math.random;

  private renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);
  private sun = new THREE.DirectionalLight(0xffffff, 2.5);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x556b2f, 1);
  private sky: THREE.Mesh | null = null;
  private clock = new THREE.Clock();
  private accumulator = 0;

  private save: SaveData;
  mode: Mode = 'menu';
  private worldIndex = 0;
  private stageIndex = 0;
  stage: StageBase | null = null;
  private world: WorldDef = WORLDS[0];

  hearts = MAX_HEARTS;
  stageStars = 0;
  stageCoins = 0;
  private checkpoint = new THREE.Vector3();
  private _busy = false;
  private cut: { t: number; duration: number; camera(t: number, out: { pos: THREE.Vector3; look: THREE.Vector3 }): void; done?: () => void } | null = null;
  private facing = Math.PI;
  private camPos = new THREE.Vector3(0, 6, 14);
  private camLook = new THREE.Vector3();
  private introTime = 0;
  private introDef: ReturnType<StageBase['intro']> = null;
  private completeTime = 0;
  private menuTime = 0;
  private timers: { t: number; fn: () => void }[] = [];
  private frameTimes: number[] = [];
  private pixelRatio = 1;
  private lastPraise = '';
  /** Narration clip for the question currently on screen. */
  private questionVoice: string | null = null;
  /** Sound that follows the narration (the animal call in "which animal sounds like this?"). */
  private questionSfx: string | null = null;
  /** Frames rendered, for automated tests. */
  frames = 0;

  constructor(private mount: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Neutral tone mapping keeps the bright, saturated cartoon palette (ACES greys it out).
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.id = 'game-canvas';
    mount.appendChild(this.renderer.domElement);

    this.input = new Input(mount);
    const small = Math.min(window.innerWidth, window.innerHeight) < 600 || this.input.isTouch;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);

    this.scene.add(this.hemi, this.sun, this.sun.target, this.affan.root, this.sparkles.points);
    this.sun.castShadow = true;
    const size = small ? 1024 : 2048;
    this.sun.shadow.mapSize.set(size, size);
    const sc = this.sun.shadow.camera;
    sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 90;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;

    this.save = loadSave();
    this.audio.settings = { ...this.save.audio };

    this.hud = new Hud(mount, {
      onPlay: () => this.continueGame(),
      onSelectWorld: (i) => this.startWorld(i),
      onResume: () => this.setPaused(false),
      onRestart: () => { this.setPaused(false); this.loadStage(this.worldIndex, this.stageIndex, false); },
      onQuitToMenu: () => this.toMenu(),
      onGoWorlds: () => { this.toMenu(); this.hud.show('worlds'); },
      onNextStage: () => this.nextStage(),
      onPause: () => this.setPaused(true),
      onAudioChange: (key, value) => {
        this.audio.settings[key] = value;
        this.audio.applySettings();
        this.persist();
      },
      onMuteToggle: () => {
        this.audio.settings.muted = !this.audio.settings.muted;
        this.audio.applySettings();
        this.persist();
        return this.audio.settings.muted;
      },
      onButtonSound: () => this.audio.sfx('button'),
      onFirstGesture: () => this.unlockAudio(),
      onReplayQuestion: () => this.replayQuestion(),
    });
    this.hud.setAudioControls(this.save.audio);
    this.input.onNumberKey = (n) => this.hud.answer(n - 1);
    this.input.onReplayKey = () => this.replayQuestion();
    this.input.onPauseKey = () => {
      if (this.mode === 'play') this.setPaused(true);
      else if (this.mode === 'paused') this.setPaused(false);
    };
    this.affan.onStep = () => {
      if (this.body.grounded && this.mode !== 'menu') {
        this.audio.sfx(this.world.theme.footstep, { volume: 0.35, rate: 0.9 + Math.random() * 0.25, minGap: 0.12 });
      }
    };

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'play') this.setPaused(true);
    });
    // Skip the opening shots with a tap or a key.
    const skip = (): void => {
      if (this.mode === 'intro' && this.introTime > 0.8) this.introTime = 999;
    };
    this.renderer.domElement.addEventListener('pointerdown', () => { this.unlockAudio(); skip(); });
    window.addEventListener('keydown', () => { this.unlockAudio(); skip(); });
    this.resize();
  }

  get busy(): boolean {
    return this._busy || this.cut !== null || this.mode !== 'play';
  }

  // ---- Boot & flow ----------------------------------------------------------------

  start(): void {
    // The generated model streams in behind the menu; the built-in body covers until then.
    const modelFile = import.meta.env.VITE_MODEL_AS_TEXT ? 'affan.glb.txt' : 'affan.glb';
    void this.affan.loadModel(`${import.meta.env.BASE_URL}assets/models/${modelFile}`);
    this.toMenu();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private unlockAudio(): void {
    const first = !this.audio.ctx;
    this.audio.unlock();
    if (first && this.audio.ctx) {
      this.audio.preload();
      void this.audio.music(this.world.theme.music);
    }
  }

  private persist(): void {
    this.save.audio = { ...this.audio.settings };
    storeSave(this.save);
  }

  private toMenu(): void {
    this.mode = 'menu';
    this._busy = false;
    this.cut = null;
    this.timers = [];
    this.hud.setHudVisible(false);
    this.hud.hideQuestion();
    this.input.setTouchVisible(false);
    this.hud.renderWorlds(WORLDS, this.save);
    const progressed = Object.keys(this.save.stagesDone).length > 0;
    this.hud.setPlayLabel(progressed);
    this.hud.show('menu');
    this.audio.stopLoops();
    // The menu backdrop is the first jungle stage with Affan waving hello.
    this.buildStage(0, 0);
    this.body.teleport(3.4, 0, 4.2);
    this.body.active = false;
    this.facing = 0.35;
    this.menuTime = 0;
    void this.audio.music(this.world.theme.music);
  }

  /** "Play" continues from the first unfinished stage. */
  private continueGame(): void {
    let w = Math.min(this.save.unlockedWorld, WORLDS.length - 1);
    while (w > 0 && !WORLDS[w].available) w--;
    this.startWorld(w);
  }

  private startWorld(index: number): void {
    const world = WORLDS[index];
    const done = this.save.stagesDone[world.id] ?? 0;
    const stage = done >= world.stages.length ? 0 : done;
    this.loadStage(index, stage, true);
  }

  /** Blend the sky, fog and light from the world's own look (k = 0) toward another (k = 1). */
  mood(to: WorldTheme, k: number): void {
    const from = this.world.theme;
    const mix = (a: number, b: number): THREE.Color => new THREE.Color(a).lerp(new THREE.Color(b), k);
    const num = (a: number, b: number): number => a + (b - a) * k;
    if (this.sky) {
      const u = (this.sky.material as THREE.ShaderMaterial).uniforms;
      u.top.value.copy(mix(from.sky[0], to.sky[0]));
      u.horizon.value.copy(mix(from.sky[1], to.sky[1]));
      u.bottom.value.copy(mix(from.sky[2], to.sky[2]));
    }
    const fog = this.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.color.copy(mix(from.fog.color, to.fog.color));
      fog.near = num(from.fog.near, to.fog.near);
      fog.far = num(from.fog.far, to.fog.far);
    }
    this.sun.color.copy(mix(from.sun.color, to.sun.color));
    this.sun.intensity = num(from.sun.intensity, to.sun.intensity);
    this.hemi.color.copy(mix(from.ambient.sky, to.ambient.sky));
    this.hemi.groundColor.copy(mix(from.ambient.ground, to.ambient.ground));
    this.hemi.intensity = num(from.ambient.intensity, to.ambient.intensity);
  }

  private applyTheme(theme: WorldTheme): void {
    if (this.sky) {
      this.sky.removeFromParent();
      this.sky.geometry.dispose();
    }
    this.sky = makeSky(theme.sky[0], theme.sky[1], theme.sky[2]);
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog(theme.fog.color, theme.fog.near, theme.fog.far);
    this.sun.color.setHex(theme.sun.color);
    this.sun.intensity = theme.sun.intensity;
    this.hemi.color.setHex(theme.ambient.sky);
    this.hemi.groundColor.setHex(theme.ambient.ground);
    this.hemi.intensity = theme.ambient.intensity;
  }

  private buildStage(worldIndex: number, stageIndex: number): void {
    this.stage?.dispose();
    this.physics.clear();
    this.worldIndex = worldIndex;
    this.stageIndex = stageIndex;
    this.world = WORLDS[worldIndex];
    this.applyTheme(this.world.theme);
    const def = this.world.stages[stageIndex];
    this.stage = def.create(this);
    this.stage.build();
    this.scene.add(this.stage.group);
    const s = this.stage.spawn;
    this.body.teleport(s.x, s.y, s.z);
    this.checkpoint.copy(s);
    this.facing = Math.PI;
    this.affan.play('none');
    this.affan.setExpression('happy');
  }

  loadStage(worldIndex: number, stageIndex: number, withIntro: boolean): void {
    this.timers = [];
    this._busy = false;
    this.cut = null;
    this.hud.hideQuestion();
    this.audio.stopLoops();
    this.buildStage(worldIndex, stageIndex);
    this.hearts = MAX_HEARTS;
    this.stageStars = 0;
    this.stageCoins = 0;
    this.hud.setHearts(this.hearts, MAX_HEARTS);
    this.hud.setCounters(0, this.save.coins);
    const def = this.world.stages[stageIndex];
    this.hud.setStageLabel(`${this.world.emoji} ${this.world.name} · ${stageIndex + 1}/${this.world.stages.length}`);
    this.hud.show('none');
    this.hud.setHudVisible(true);
    this.input.setTouchVisible(this.input.isTouch);
    void this.audio.music(this.world.theme.music);
    if (this.world.theme.ambience) void this.audio.loop(this.world.theme.ambience.name, this.world.theme.ambience.volume);

    this.introDef = withIntro ? this.stage!.intro() : null;
    if (this.introDef) {
      this.mode = 'intro';
      this.introTime = 0;
      this.body.active = false;
      // Affan walks in from behind the spawn point during the opening shots.
      const s = this.stage!.spawn;
      this.body.teleport(s.x, s.y, s.z + this.stage!.introWalk);
      this.hud.titleCard(`Peringkat ${stageIndex + 1}: ${def.name}`, def.hint, 3.4);
    } else {
      this.beginPlay(false);
    }
  }

  private beginPlay(fromIntro: boolean): void {
    this.mode = 'play';
    this.body.active = true;
    const s = this.stage!.spawn;
    this.snapCamera(s);
    const line = this.world.introLine;
    if (fromIntro && this.stageIndex === 0 && line) {
      this.say(line.text, { voice: line.voice, emote: 'wave', duration: 3.6 });
    } else {
      this.say('Jom!', { voice: 'jom', emote: 'celebrate', duration: 1.4 });
    }
  }

  private snapCamera(target: THREE.Vector3): void {
    const off = this.stage!.cameraOffset;
    this.camPos.set(target.x + off.x, target.y + off.y, target.z + off.z);
    this.camLook.set(target.x, target.y + 1.1, target.z - 1.6);
  }

  private setPaused(v: boolean): void {
    if (v && this.mode === 'play') {
      this.mode = 'paused';
      this.hud.show('pause');
      this.input.setTouchVisible(false);
    } else if (!v && this.mode === 'paused') {
      this.mode = 'play';
      this.hud.show('none');
      this.input.setTouchVisible(this.input.isTouch);
      this.clock.getDelta();
    }
  }

  private after(seconds: number, fn: () => void): void {
    this.timers.push({ t: seconds, fn });
  }

  // ---- GameApi: rewards, feedback, rules --------------------------------------------

  addCoin(at: THREE.Vector3): void {
    this.stageCoins++;
    this.save.coins++;
    this.audio.sfx('coin', { rate: 0.95 + Math.random() * 0.15 });
    this.sparkles.burst(at, 8, [0xffd43b, 0xffe066, 0xffffff], 2.6);
    this.hud.setCounters(this.stageStars, this.save.coins);
  }

  addStar(at: THREE.Vector3): void {
    this.stageStars++;
    this.audio.sfx('star');
    this.sparkles.burst(at, 26, [0xffd43b, 0xfff3bf, 0xffffff], 4.5);
    this.hud.setCounters(this.stageStars, this.save.coins);
  }

  praise(at?: THREE.Vector3): void {
    let line = pick(Math.random, PRAISE_LINES);
    if (line.text === this.lastPraise) line = pick(Math.random, PRAISE_LINES);
    this.lastPraise = line.text;
    this.audio.sfx('correct');
    this.hud.toast(line.text, 'good');
    this.affan.play('celebrate', 1.4);
    // The spoken words are the same as the words on screen.
    void this.audio.voice(line.voice);
    if (at) this.sparkles.burst(at, 30);
  }

  encourage(): void {
    const line = pick(Math.random, ENCOURAGE_LINES);
    this.hud.toast(line.text, 'soft');
    void this.audio.voice(line.voice);
  }

  say(text: string, opts: { voice?: string; emote?: Emote; duration?: number } = {}): void {
    const d = opts.duration ?? 2.4;
    this.hud.bubble(text, d);
    if (opts.emote) this.affan.play(opts.emote, d);
    if (opts.voice) void this.audio.voice(opts.voice);
  }

  caption(speaker: string, text: string, opts: { voice?: string; duration?: number } = {}): void {
    this.hud.caption(speaker, text, opts.duration ?? 5);
    if (opts.voice) void this.audio.voice(opts.voice, { queue: true });
  }

  showQuestion(prompt: string, detail?: string, voice?: string, thenSfx?: string): void {
    this.hud.showQuestion(prompt, detail);
    const isNew = !!voice && (voice !== this.questionVoice || (thenSfx ?? null) !== this.questionSfx);
    this.questionVoice = voice ?? null;
    this.questionSfx = thenSfx ?? null;
    // Read a new question aloud once; progress updates to the same question stay quiet.
    if (isNew) this.speakQuestion(true);
  }

  /** Narrate the current question, then play its follow-up sound if it has one. */
  private speakQuestion(queue: boolean): void {
    const voice = this.questionVoice;
    const sfx = this.questionSfx;
    if (!voice) return;
    void this.audio.voice(voice, { queue }).then((seconds) => {
      if (!sfx) return;
      window.setTimeout(() => {
        // Only if the same question is still being asked.
        if (this.questionVoice === voice && this.questionSfx === sfx && this.mode === 'play') this.audio.sfx(sfx);
      }, seconds * 1000 + 250);
    });
  }

  hideQuestion(): void {
    this.hud.hideQuestion();
    this.questionVoice = null;
    this.questionSfx = null;
  }

  /** The speaker button (or R): hear the current question again. */
  private replayQuestion(): void {
    if (this.questionVoice && this.mode === 'play') this.speakQuestion(false);
  }

  setTask(text: string | null): void {
    if (text) this.hud.showQuestion(text);
    else this.hud.hideQuestion();
  }

  setCheckpoint(x: number, y: number, z: number): void {
    if (this.checkpoint.x === x && this.checkpoint.z === z) return;
    const first = this.checkpoint.equals(this.stage!.spawn) && Math.hypot(x - this.stage!.spawn.x, z - this.stage!.spawn.z) < 3.5;
    this.checkpoint.set(x, y, z);
    if (!first) {
      this.audio.sfx('star', { volume: 0.5, rate: 1.3 });
      this.hud.toast('Tempat selamat! 🚩', 'info');
    }
  }

  quiz(q: ChoiceQuestion): Promise<void> {
    this._busy = true;
    this.body.active = false;
    this.affan.play('think', 60);
    this.input.setTouchVisible(false);
    this.questionVoice = q.voice ?? null;
    if (q.voice) void this.audio.voice(q.voice, { queue: true });
    return this.hud
      .quiz(
        q,
        () => {
          this.affan.play('celebrate', 1.6);
          this.praise();
        },
        () => {
          this.audio.sfx('wrong');
          this.encourage();
        },
      )
      .then(() => {
        this._busy = false;
        this.body.active = true;
        this.questionVoice = null;
        this.input.setTouchVisible(this.input.isTouch);
      });
  }

  fell(kind: 'water' | 'sand' | 'balls' | 'lava' | 'void'): void {
    if (this._busy) return;
    this._busy = true;
    this.body.active = false;
    const at = new THREE.Vector3(this.body.x, (this.stage?.waterLevel ?? this.body.y) + 0.1, this.body.z);
    if (kind === 'water') {
      this.audio.sfx('splash');
      this.sparkles.burst(at, 46, [0xffffff, 0xa5d8ff, 0x74c0fc], 5.5);
    } else if (kind === 'lava') {
      // A cartoon "hot hot hot!": a sizzle and a puff of steam, nothing more.
      this.audio.sfx('sizzle');
      this.sparkles.burst(at, 50, [0xffffff, 0xf1f3f5, 0xffd8a8, 0xffa94d], 6);
    } else if (kind === 'balls') {
      this.audio.sfx('ball_pit');
      this.sparkles.burst(at, 46, [0xff6b6b, 0xffd43b, 0x4dabf7, 0x69db7c, 0xda77f2], 5);
    } else if (kind === 'sand') {
      this.audio.sfx('sand_sink');
      this.sparkles.burst(at, 40, [0xf4d58d, 0xe9c46a, 0xfff3bf], 4);
    }
    this.affan.play('surprised', 1);
    this.hearts = Math.max(0, this.hearts - 1);
    this.hud.setHearts(this.hearts, MAX_HEARTS);
    this.after(1.0, () => {
      if (this.hearts <= 0) {
        // No "game over": hearts refill and the stage starts fresh, with a kind word.
        this.hud.toast('Tak mengapa! Jom cuba dari awal. 💪', 'soft');
        this.loadStage(this.worldIndex, this.stageIndex, false);
        return;
      }
      this.body.teleport(this.checkpoint.x, this.checkpoint.y + 0.05, this.checkpoint.z);
      this.snapCamera(this.checkpoint);
      this.stage?.onRespawn();
      this.body.active = true;
      this._busy = false;
      this.facing = Math.PI;
      this.encourage();
      this.affan.play('none');
    });
  }

  cutscene(duration: number, camera: (t: number, out: { pos: THREE.Vector3; look: THREE.Vector3 }) => void, done?: () => void): void {
    if (this.mode !== 'play') return;
    this.cut = { t: 0, duration, camera, done };
    this.hud.hideQuestion();
  }

  completeStage(opts: { line?: { text: string; voice: string }; delay?: number } = {}): void {
    if (this.mode !== 'play') return;
    this.cut = null;
    this.mode = 'complete';
    this._busy = true;
    this.body.active = false;
    this.completeTime = 0;
    this.input.setTouchVisible(false);
    this.hud.hideQuestion();
    this.audio.sfx('level_complete');
    this.affan.play('victory', 60);
    this.sparkles.burst(new THREE.Vector3(this.body.x, this.body.y + 2, this.body.z), 60, undefined, 6);
    if (opts.line) this.say(opts.line.text, { voice: opts.line.voice, duration: 5.5 });
    else this.say('Yeay! Kita dah berjaya!', { voice: 'kita_dah_berjaya', duration: 3 });

    const world = this.world;
    const def = world.stages[this.stageIndex];
    const last = this.stageIndex === world.stages.length - 1;
    this.save.stagesDone[world.id] = Math.max(this.save.stagesDone[world.id] ?? 0, this.stageIndex + 1);
    this.save.stageStars[def.id] = Math.max(this.save.stageStars[def.id] ?? 0, this.stageStars);
    let badge: { name: string; emoji: string } | undefined;
    if (last) {
      if (!this.save.badges.includes(world.badge.id)) this.save.badges.push(world.badge.id);
      this.save.unlockedWorld = Math.max(this.save.unlockedWorld, Math.min(world.index + 1, WORLDS.length - 1));
      badge = world.badge;
    }
    this.persist();

    // Finishing the last world is finishing the game: the results screen becomes the trophy.
    const trophy = last && world.index === WORLDS.length - 1;
    this.after(opts.delay ?? 2.6, () => {
      if (badge) this.audio.sfx('achievement');
      this.hud.setHudVisible(false);
      this.hud.showComplete({
        title: trophy ? 'Tahniah, Affan!' : last ? `${world.name} selesai!` : 'Peringkat selesai!',
        subtitle: trophy ? 'Semua dunia sudah diteroka!' : last ? 'Affan mendapat lencana baharu!' : def.name,
        trophy,
        stars: Math.min(3, this.stageStars),
        maxStars: 3,
        coins: this.stageCoins,
        badge,
        nextLabel: last ? null : '▶ Peringkat seterusnya',
      });
    });
  }

  private nextStage(): void {
    const next = this.stageIndex + 1;
    if (next < this.world.stages.length) this.loadStage(this.worldIndex, next, true);
    else this.toMenu();
  }

  // ---- Main loop ----------------------------------------------------------------------

  private resize(): void {
    const w = this.mount.clientWidth || window.innerWidth;
    const h = this.mount.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Portrait phones get a wider field of view so the path stays visible.
    this.camera.fov = w / h < 0.8 ? 68 : w / h < 1.2 ? 60 : 52;
    this.camera.updateProjectionMatrix();
  }

  /** Drop the render resolution a notch if the device cannot hold a smooth frame rate. */
  private adaptQuality(dt: number): void {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    if (avg > 1 / 40 && this.pixelRatio > 0.75) {
      this.pixelRatio = Math.max(0.75, this.pixelRatio - 0.25);
      this.resize();
    }
  }

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.frames++;
    this.adaptQuality(dt);
    this.hud.update(dt);
    if (this.mode === 'paused') {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** Advance the simulation. Public so automated tests can step time deterministically. */
  update(dt: number): void {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const timer = this.timers[i];
      timer.t -= dt;
      if (timer.t <= 0) {
        this.timers.splice(i, 1);
        timer.fn();
      }
    }

    const inp = this.input.read();
    let mx = 0;
    let mz = 0;
    let jumpPressed = false;
    let jumpHeld = false;
    let run = false;
    if (this.mode === 'play' && !this._busy && !this.cut) {
      mx = inp.moveX;
      mz = -inp.moveY;
      jumpPressed = inp.jumpPressed;
      jumpHeld = inp.jumpHeld;
      run = inp.run;
    } else if (this.mode === 'intro') {
      // Scripted walk-in.
      const s = this.stage!.spawn;
      if (this.body.z > s.z + 0.05) mz = -0.8;
      this.body.active = true;
    }

    // Fixed-step physics keeps jumps identical on fast and slow devices.
    this.accumulator = Math.min(this.accumulator + dt, 0.1);
    let first = true;
    while (this.accumulator >= STEP) {
      const ev = this.body.step(STEP, { x: mx, z: mz, run, jumpPressed: first && jumpPressed, jumpHeld });
      first = false;
      this.accumulator -= STEP;
      if (ev.jumped) this.audio.sfx('jump', { volume: 0.6 });
      if (ev.landed && ev.landSpeed > 3) {
        this.audio.sfx('land', { volume: Math.min(0.8, 0.25 + ev.landSpeed * 0.04) });
        this.affan.notifyLanded();
      }
      // Platforms report their per-step movement; clear it once applied.
      for (const c of this.physics.colliders) c.dx = c.dy = c.dz = 0;
    }
    if (this.mode === 'intro') this.body.active = false;

    // Turn Affan toward where he is going.
    const speed = this.body.horizontalSpeed;
    if (speed > 0.4) {
      const target = Math.atan2(this.body.vx, this.body.vz);
      let d = target - this.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.facing += d * Math.min(1, dt * 12);
    }
    this.affan.root.position.set(this.body.x, this.body.y, this.body.z);
    this.affan.root.rotation.y = this.facing;
    this.affan.update(dt, { speed, grounded: this.body.grounded, vy: this.body.vy, running: run });

    this.stage?.update(dt);
    this.sparkles.update(dt);
    this.updateCamera(dt);

    // Shadows follow Affan so they stay sharp wherever he goes.
    const dir = this.world.theme.sun.dir;
    this.sun.target.position.set(this.body.x, 0, this.body.z - 3);
    this.sun.position.set(this.body.x + dir[0] * 30, dir[1] * 30, this.body.z - 3 + dir[2] * 30);
    if (this.sky) this.sky.position.copy(this.camera.position);
  }

  private updateCamera(dt: number): void {
    const b = this.body;
    const off = this.stage!.cameraOffset;
    if (this.mode === 'menu') {
      this.menuTime += dt;
      const a = 0.5 + Math.sin(this.menuTime * 0.25) * 0.35;
      const landscape = this.camera.aspect > 1.1;
      // Affan stands to the right on wide screens (menu on the left), centred on phones.
      const side = landscape ? -1.5 : 0;
      this.camPos.set(b.x + Math.sin(a) * 4.6 + side, b.y + 1.5, b.z + Math.cos(a) * 4.6);
      this.camLook.set(b.x + side, b.y + (landscape ? 0.85 : 1.25), b.z);
      if (Math.floor(this.menuTime) % 7 === 2 && this.affan.currentEmote === 'none') this.affan.play('wave', 1.6);
    } else if (this.mode === 'intro' && this.introDef) {
      this.introTime += dt;
      const out = { pos: this.camPos, look: this.camLook };
      this.introDef.camera(Math.min(this.introTime, this.introDef.duration), out);
      if (this.introTime >= this.introDef.duration) this.beginPlay(true);
    } else if (this.cut && this.mode === 'play') {
      const cut = this.cut;
      cut.t += dt;
      cut.camera(Math.min(cut.t, cut.duration), { pos: this.camPos, look: this.camLook });
      if (cut.t >= cut.duration) {
        this.cut = null;
        cut.done?.();
      }
    } else if (this.mode === 'complete') {
      this.completeTime += dt;
      const a = this.completeTime * 0.7;
      const target = new THREE.Vector3(b.x + Math.sin(a) * 5, b.y + 2.4, b.z + Math.cos(a) * 5);
      this.camPos.lerp(target, 1 - Math.exp(-dt * 3));
      this.camLook.lerp(new THREE.Vector3(b.x, b.y + 0.9, b.z), 1 - Math.exp(-dt * 5));
    } else {
      // Smooth third-person follow: quick enough to keep up, soft enough not to shake.
      const k = 1 - Math.exp(-dt * 6);
      this.camPos.x += (b.x * 0.85 + off.x - this.camPos.x) * k;
      this.camPos.z += (b.z + off.z - this.camPos.z) * k;
      // Follow height gently so jumps do not bounce the whole view.
      this.camPos.y += (Math.max(b.y, -0.5) + off.y - this.camPos.y) * (1 - Math.exp(-dt * 2.5));
      const kl = 1 - Math.exp(-dt * 9);
      this.camLook.x += (b.x - this.camLook.x) * kl;
      this.camLook.z += (b.z - 1.6 - this.camLook.z) * kl;
      this.camLook.y += (Math.max(b.y, -0.5) + 1.1 - this.camLook.y) * (1 - Math.exp(-dt * 4));
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  /** Snapshot of the game state for automated tests. */
  /**
   * For tests: what solid scenery stands between the camera and Affan. Checks
   * four sight lines (to his head, his waist, his feet, and the ground a few
   * steps ahead of him) and names the first thing blocking each.
   */
  viewBlocked(): { line: 'head' | 'waist' | 'feet' | 'ahead'; size: number; at: [number, number, number]; what: string }[] {
    const stage = this.stage;
    if (!stage) return [];
    const b = this.body;
    const from = this.camera.position;
    const ray = new THREE.Raycaster();
    ray.camera = this.camera;
    const lines: ['head' | 'waist' | 'feet' | 'ahead', THREE.Vector3][] = [
      ['head', new THREE.Vector3(b.x, b.y + 1.1, b.z)],
      ['waist', new THREE.Vector3(b.x, b.y + 0.65, b.z)],
      ['feet', new THREE.Vector3(b.x, b.y + 0.25, b.z)],
      ['ahead', new THREE.Vector3(b.x, b.y + 0.3, b.z - 3.5)],
    ];
    const solid = (o: THREE.Object3D): boolean => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return false;
      if (m.material.transparent && m.material.opacity < 0.6) return false;
      if ((m.material as THREE.ShaderMaterial).isShaderMaterial) return false;
      for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
      return true;
    };
    const out: { line: 'head' | 'waist' | 'feet' | 'ahead'; size: number; at: [number, number, number]; what: string }[] = [];
    // Tests step the game without rendering, so world matrices may be stale.
    stage.group.updateMatrixWorld(true);
    for (const [line, to] of lines) {
      const dir = to.clone().sub(from);
      const dist = dir.length();
      ray.set(from, dir.normalize());
      ray.far = dist - 0.3;
      const hit = ray.intersectObject(stage.group, true).find((h) => solid(h.object));
      if (!hit) continue;
      const m = hit.object as THREE.Mesh;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      const scale = m.getWorldScale(new THREE.Vector3());
      const colour = (m.material as THREE.MeshStandardMaterial).color?.getHexString() ?? '';
      out.push({ line, size: m.geometry.boundingSphere!.radius * Math.max(scale.x, scale.y, scale.z), at: [hit.point.x, hit.point.y, hit.point.z], what: `${m.geometry.type} #${colour}` });
    }
    return out;
  }

  debugState(): Record<string, unknown> {
    return {
      mode: this.mode,
      world: this.world.id,
      stage: this.world.stages[this.stageIndex]?.id,
      x: this.body.x, y: this.body.y, z: this.body.z,
      grounded: this.body.grounded,
      hearts: this.hearts,
      stars: this.stageStars,
      coins: this.stageCoins,
      busy: this._busy,
      animation: this.affan.animation,
      model: this.affan.usingModel,
      question: this.hud.questionText,
      questionVoice: this.questionVoice,
      questionSfx: this.questionSfx,
      screen: this.hud.current,
      music: this.audio.currentMusic,
      musicPlaying: this.audio.musicPlaying,
      save: this.save,
      frames: this.frames,
    };
  }
}
