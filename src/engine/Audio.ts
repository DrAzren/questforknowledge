/**
 * Audio: looping world music with a crossfaded loop point, ambience loops,
 * one-shot sound effects and voice lines (music ducks under voices).
 * Every effect has a small synthesised fallback so the game is never silent
 * if a file is missing or still downloading.
 */

export interface AudioSettings {
  music: number;
  sfx: number;
  voice: number;
  muted: boolean;
}

const BASE = `${import.meta.env.BASE_URL}assets/audio/`;

export const SFX_FILES = [
  'step_grass', 'jump', 'land', 'coin', 'star', 'correct', 'wrong', 'splash',
  'croc', 'achievement', 'level_complete', 'stone_sink',
  'step_sand', 'stone_door', 'carpet', 'sand_sink', 'bump',
] as const;
/** Sounds that are always synthesised (no audio file). */
const SYNTH_ONLY = new Set(['button']);
export const LOOP_FILES = ['waterfall', 'jungle_amb', 'wind'] as const;

interface LoopHandle {
  gain: GainNode;
  source: AudioBufferSourceNode;
}

export class AudioManager {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private musicDuck!: GainNode;
  private sfxGain!: GainNode;
  private voiceGain!: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<AudioBuffer | null>>();
  private loops = new Map<string, LoopHandle>();
  /** The track the game wants; it may be requested before audio is unlocked. */
  private musicName: string | null = null;
  /** The track actually started. */
  private startedMusic: string | null = null;
  private musicToken = 0;
  private musicNodes: { src: AudioBufferSourceNode; gain: GainNode }[] = [];
  private musicTimer: number | null = null;
  private voiceSource: AudioBufferSourceNode | null = null;
  private lastPlayed = new Map<string, number>();
  settings: AudioSettings = { music: 0.55, sfx: 0.9, voice: 1, muted: false };
  /** Names of every sound requested, for automated tests. */
  log: string[] = [];

  /** Must be called from a user gesture (browser autoplay rules). */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicDuck = this.ctx.createGain();
      this.musicGain.connect(this.musicDuck).connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.master);
      this.voiceGain = this.ctx.createGain();
      this.voiceGain.connect(this.master);
      this.applySettings();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  applySettings(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.muted ? 0 : 1, t, 0.05);
    this.musicGain.gain.setTargetAtTime(this.settings.music, t, 0.05);
    this.sfxGain.gain.setTargetAtTime(this.settings.sfx, t, 0.05);
    this.voiceGain.gain.setTargetAtTime(this.settings.voice, t, 0.05);
  }

  /** Pause/resume everything (tab hidden, pause menu keeps music running softly). */
  suspend(v: boolean): void {
    if (!this.ctx) return;
    if (v) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  private load(path: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(path);
    if (cached) return Promise.resolve(cached);
    let p = this.pending.get(path);
    if (!p) {
      p = (async () => {
        if (!this.ctx) return null;
        try {
          const res = await fetch(BASE + path);
          if (!res.ok) return null;
          const data = await res.arrayBuffer();
          const buf = await this.ctx.decodeAudioData(data);
          this.buffers.set(path, buf);
          return buf;
        } catch {
          return null;
        }
      })();
      this.pending.set(path, p);
    }
    return p;
  }

  /** Warm the cache for the short sounds so the first jump is not silent. */
  preload(): void {
    if (!this.ctx) return;
    for (const n of SFX_FILES) void this.load(`sfx/${n}.mp3`);
    for (const n of LOOP_FILES) void this.load(`sfx/${n}.mp3`);
  }

  sfx(name: string, opts: { volume?: number; rate?: number; minGap?: number } = {}): void {
    this.log.push(`sfx:${name}`);
    if (this.log.length > 200) this.log.shift();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const gap = opts.minGap ?? 0.03;
    if (now - (this.lastPlayed.get(name) ?? -1) < gap) return;
    this.lastPlayed.set(name, now);
    const buf = this.buffers.get(`sfx/${name}.mp3`);
    if (!buf) {
      if (!SYNTH_ONLY.has(name)) void this.load(`sfx/${name}.mp3`);
      this.synth(name, opts.volume ?? 1);
      return;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = this.ctx.createGain();
    g.gain.value = opts.volume ?? 1;
    src.connect(g).connect(this.sfxGain);
    src.start();
  }

  private voiceEndsAt = 0;
  private voiceToken = 0;

  /**
   * Play a voice line; music ducks while it plays. Returns its duration in seconds (0 if unavailable).
   * With `queue`, the line waits for whoever is speaking to finish (used for
   * question narration, so it never cuts Affan off); otherwise it interrupts.
   */
  async voice(name: string, opts: { queue?: boolean } = {}): Promise<number> {
    this.log.push(`voice:${name}`);
    if (!this.ctx) return 0;
    const token = ++this.voiceToken;
    const buf = await this.load(`voice/${name}.mp3`);
    if (!buf || !this.ctx) return 0;
    if (opts.queue) {
      const wait = this.voiceEndsAt - this.ctx.currentTime;
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, (wait + 0.2) * 1000));
        // Something newer was requested while waiting: let that one speak instead.
        if (token !== this.voiceToken || !this.ctx) return 0;
      }
    }
    if (this.voiceSource) {
      try { this.voiceSource.stop(); } catch { /* already stopped */ }
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.voiceGain);
    const t = this.ctx.currentTime;
    this.musicDuck.gain.cancelScheduledValues(t);
    this.musicDuck.gain.setTargetAtTime(0.35, t, 0.08);
    this.musicDuck.gain.setTargetAtTime(1, t + buf.duration, 0.25);
    src.start();
    this.voiceEndsAt = t + buf.duration;
    this.voiceSource = src;
    src.onended = () => {
      if (this.voiceSource === src) this.voiceSource = null;
    };
    return buf.duration;
  }

  /** Switch background music, crossfading from whatever is playing. */
  async music(name: string | null): Promise<void> {
    if (name !== this.musicName) this.log.push(`music:${name}`);
    this.musicName = name;
    if (!this.ctx || name === this.startedMusic) return;
    this.startedMusic = name;
    const token = ++this.musicToken;
    this.stopMusicNodes(1.2);
    if (!name) return;
    const buf = await this.load(`music/${name}.mp3`);
    if (!buf || !this.ctx || token !== this.musicToken) return;
    this.scheduleMusic(buf, token, true);
  }

  /**
   * Generated tracks are not sample-accurate loops, so each pass overlaps the
   * next by a few seconds with an equal-power-ish crossfade: no click, no gap.
   */
  private scheduleMusic(buf: AudioBuffer, token: number, first: boolean): void {
    if (!this.ctx || token !== this.musicToken) return;
    const ctx = this.ctx;
    const xf = Math.min(3, buf.duration / 4);
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + (first ? 1.5 : xf));
    g.gain.setValueAtTime(1, t + buf.duration - xf);
    g.gain.linearRampToValueAtTime(0, t + buf.duration);
    src.connect(g).connect(this.musicGain);
    src.start(t);
    src.stop(t + buf.duration + 0.05);
    const node = { src, gain: g };
    this.musicNodes.push(node);
    src.onended = () => {
      const i = this.musicNodes.indexOf(node);
      if (i >= 0) this.musicNodes.splice(i, 1);
    };
    this.musicTimer = window.setTimeout(
      () => this.scheduleMusic(buf, token, false),
      Math.max(100, (buf.duration - xf) * 1000),
    );
  }

  private stopMusicNodes(fade: number): void {
    if (this.musicTimer !== null) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const n of this.musicNodes) {
      n.gain.gain.cancelScheduledValues(t);
      n.gain.gain.setValueAtTime(n.gain.gain.value, t);
      n.gain.gain.linearRampToValueAtTime(0, t + fade);
      try { n.src.stop(t + fade + 0.05); } catch { /* already stopped */ }
    }
    this.musicNodes = [];
  }

  get currentMusic(): string | null {
    return this.musicName;
  }

  get musicPlaying(): boolean {
    return this.musicNodes.length > 0;
  }

  /** Start (or adjust) a looping ambience such as a waterfall. Volume 0 stops it. */
  async loop(name: string, volume: number): Promise<void> {
    if (!this.ctx) return;
    const existing = this.loops.get(name);
    if (existing) {
      existing.gain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.15);
      return;
    }
    if (volume <= 0) return;
    const buf = await this.load(`sfx/${name}.mp3`);
    if (!buf || !this.ctx || this.loops.has(name)) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    // Skip the very edges of the clip, where generated ambience often fades.
    src.loopStart = Math.min(0.4, buf.duration * 0.1);
    src.loopEnd = buf.duration - Math.min(0.4, buf.duration * 0.1);
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.4);
    src.connect(g).connect(this.sfxGain);
    src.start();
    this.loops.set(name, { gain: g, source: src });
  }

  stopLoops(): void {
    if (!this.ctx) return;
    for (const [, h] of this.loops) {
      h.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
      try { h.source.stop(this.ctx.currentTime + 1); } catch { /* already stopped */ }
    }
    this.loops.clear();
  }

  // ---- Synthesised fallbacks -------------------------------------------------

  private tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, slideTo?: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + start;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(start: number, dur: number, vol: number, lowpass: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + start;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start(t);
  }

  private synth(name: string, v: number): void {
    switch (name) {
      case 'jump': this.tone(320, 0, 0.18, 'sine', 0.25 * v, 720); break;
      case 'land': this.noise(0, 0.1, 0.25 * v, 500); break;
      case 'step_grass': this.noise(0, 0.05, 0.08 * v, 900); break;
      case 'step_sand': this.noise(0, 0.07, 0.07 * v, 600); break;
      case 'stone_door': this.noise(0, 0.9, 0.3 * v, 300); this.tone(70, 0, 0.9, 'sawtooth', 0.08 * v, 50); break;
      case 'carpet': this.noise(0, 0.6, 0.18 * v, 2400); this.tone(500, 0, 0.5, 'sine', 0.1 * v, 900); break;
      case 'sand_sink': this.noise(0, 0.7, 0.3 * v, 700); break;
      case 'bump': this.tone(160, 0, 0.18, 'sine', 0.3 * v, 90); break;
      case 'coin': this.tone(1320, 0, 0.09, 'square', 0.1 * v); this.tone(1760, 0.07, 0.16, 'square', 0.1 * v); break;
      case 'star': [880, 1108, 1320, 1760].forEach((f, i) => this.tone(f, i * 0.06, 0.2, 'triangle', 0.18 * v)); break;
      case 'correct': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.09, 0.22, 'triangle', 0.22 * v)); break;
      case 'wrong': this.tone(300, 0, 0.16, 'sine', 0.2 * v); this.tone(240, 0.14, 0.24, 'sine', 0.2 * v); break;
      case 'splash': this.noise(0, 0.5, 0.4 * v, 1800); this.tone(220, 0, 0.3, 'sine', 0.15 * v, 80); break;
      case 'stone_sink': this.tone(180, 0, 0.5, 'sine', 0.18 * v, 60); this.noise(0.1, 0.4, 0.15 * v, 800); break;
      case 'croc': this.tone(90, 0, 0.35, 'sawtooth', 0.12 * v, 60); break;
      case 'button': this.tone(660, 0, 0.07, 'sine', 0.18 * v, 880); break;
      case 'achievement':
      case 'level_complete':
        [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, i * 0.11, 0.3, 'triangle', 0.2 * v));
        break;
      default: break;
    }
  }
}
