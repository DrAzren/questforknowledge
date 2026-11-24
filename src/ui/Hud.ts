import type { ChoiceQuestion } from '../edu/questions';
import type { SaveData } from '../engine/Save';
import type { WorldDef } from '../worlds/Stage';

/**
 * All on-screen interface: HUD, question panel, quiz buttons, menus and result
 * screens. Plain DOM so text stays crisp and buttons are big, real touch targets.
 */

export interface HudCallbacks {
  onPlay(): void;
  onSelectWorld(index: number): void;
  onResume(): void;
  onRestart(): void;
  onQuitToMenu(): void;
  onGoWorlds(): void;
  onNextStage(): void;
  onPause(): void;
  onAudioChange(key: 'music' | 'sfx' | 'voice', value: number): void;
  onMuteToggle(): boolean;
  onButtonSound(): void;
  onFirstGesture(): void;
  /** The child tapped the speaker to hear the question again. */
  onReplayQuestion(): void;
}

type Screen = 'loading' | 'menu' | 'worlds' | 'settings' | 'pause' | 'complete' | 'none';

const el = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

export class Hud {
  private screen: Screen = 'loading';
  private settingsReturn: Screen = 'menu';
  private toastTimer = 0;
  private bubbleTimer = 0;
  private captionTimer = 0;
  /** Last caption shown (for tests). */
  captionText = '';
  private quizResolve: (() => void) | null = null;
  private quizQuestion: ChoiceQuestion | null = null;
  private onWrong: (() => void) | null = null;
  private onRight: (() => void) | null = null;

  constructor(root: HTMLElement, private cb: HudCallbacks) {
    root.insertAdjacentHTML('beforeend', TEMPLATE);
    const click = (id: string, fn: () => void): void => {
      el(id).addEventListener('click', () => {
        this.cb.onFirstGesture();
        this.cb.onButtonSound();
        fn();
      });
    };
    click('btn-play', () => this.cb.onPlay());
    click('btn-worlds', () => this.show('worlds'));
    click('btn-settings', () => this.openSettings('menu'));
    click('btn-worlds-back', () => this.show('menu'));
    click('btn-settings-back', () => this.show(this.settingsReturn));
    click('btn-pause', () => this.cb.onPause());
    click('btn-resume', () => this.cb.onResume());
    click('btn-restart', () => this.cb.onRestart());
    click('btn-pause-settings', () => this.openSettings('pause'));
    click('btn-quit', () => this.cb.onQuitToMenu());
    click('btn-next', () => this.cb.onNextStage());
    click('btn-complete-menu', () => this.cb.onGoWorlds());
    for (const id of ['q-replay', 'quiz-replay']) {
      el(id).addEventListener('click', () => {
        this.cb.onFirstGesture();
        this.cb.onReplayQuestion();
      });
    }
    click('btn-mute', () => {
      const muted = this.cb.onMuteToggle();
      el('btn-mute').textContent = muted ? '🔇 Bunyi: Tutup' : '🔊 Bunyi: Buka';
    });
    for (const key of ['music', 'sfx', 'voice'] as const) {
      el<HTMLInputElement>(`vol-${key}`).addEventListener('input', (e) => {
        this.cb.onAudioChange(key, Number((e.target as HTMLInputElement).value) / 100);
      });
    }
  }

  // ---- Screens ----------------------------------------------------------------

  show(screen: Screen): void {
    this.screen = screen;
    for (const s of ['loading', 'menu', 'worlds', 'settings', 'pause', 'complete']) {
      el(`screen-${s}`).classList.toggle('visible', s === screen);
    }
  }

  get current(): Screen {
    return this.screen;
  }

  private openSettings(from: Screen): void {
    this.settingsReturn = from;
    this.show('settings');
  }

  setHudVisible(v: boolean): void {
    el('hud').classList.toggle('visible', v);
  }

  setAudioControls(a: SaveData['audio']): void {
    el<HTMLInputElement>('vol-music').value = String(Math.round(a.music * 100));
    el<HTMLInputElement>('vol-sfx').value = String(Math.round(a.sfx * 100));
    el<HTMLInputElement>('vol-voice').value = String(Math.round(a.voice * 100));
    el('btn-mute').textContent = a.muted ? '🔇 Bunyi: Tutup' : '🔊 Bunyi: Buka';
  }

  setPlayLabel(hasProgress: boolean): void {
    el('btn-play').textContent = hasProgress ? '▶ Sambung' : '▶ Main';
  }

  /** Build the five world portals, with locks on the ones not reached yet. */
  renderWorlds(worlds: WorldDef[], save: SaveData): void {
    const grid = el('world-grid');
    grid.innerHTML = '';
    worlds.forEach((w, i) => {
      const unlocked = i <= save.unlockedWorld;
      const done = save.stagesDone[w.id] ?? 0;
      const total = w.stages.length || 3;
      const hasBadge = save.badges.includes(w.badge.id);
      const card = document.createElement('button');
      card.className = `world-card world-${w.id}${unlocked ? '' : ' locked'}${unlocked && w.available ? ' live' : ''}`;
      card.setAttribute('aria-label', `${w.name}${unlocked ? '' : ' (berkunci)'}`);
      const status = !unlocked
        ? '<span class="lock">🔒</span><span class="status">Berkunci</span>'
        : !w.available
          ? '<span class="status soon">Akan datang!</span>'
          : `<span class="status">${hasBadge ? w.badge.emoji + ' Selesai' : `Peringkat ${Math.min(done + 1, total)} / ${total}`}</span>`;
      card.innerHTML = `
        <span class="portal"><span class="portal-emoji">${w.emoji}</span></span>
        <span class="world-num">Dunia ${i + 1}</span>
        <span class="world-name">${w.name}</span>
        <span class="world-tag">${w.tagline}</span>
        ${status}`;
      card.addEventListener('click', () => {
        this.cb.onFirstGesture();
        this.cb.onButtonSound();
        if (!unlocked) {
          this.toast(`Selesaikan Dunia ${i} dahulu! 🔒`);
          card.classList.remove('shake');
          void card.offsetWidth;
          card.classList.add('shake');
          return;
        }
        if (!w.available) {
          this.toast('Dunia ini akan datang tidak lama lagi! ✨');
          return;
        }
        this.cb.onSelectWorld(i);
      });
      grid.appendChild(card);
    });
  }

  // ---- In-game HUD --------------------------------------------------------------

  setHearts(n: number, max = 3): void {
    const wrap = el('hearts');
    wrap.innerHTML = '';
    for (let i = 0; i < max; i++) {
      const h = document.createElement('span');
      h.className = `heart${i < n ? '' : ' empty'}`;
      h.textContent = i < n ? '❤️' : '🤍';
      wrap.appendChild(h);
    }
    wrap.dataset.count = String(n);
  }

  setCounters(stars: number, coins: number): void {
    this.bump('count-stars', String(stars));
    this.bump('count-coins', String(coins));
  }

  private bump(id: string, text: string): void {
    const e = el(id);
    if (e.textContent === text) return;
    e.textContent = text;
    const p = e.parentElement!;
    p.classList.remove('bump');
    void p.offsetWidth;
    p.classList.add('bump');
  }

  setStageLabel(text: string): void {
    el('stage-label').textContent = text;
  }

  showQuestion(prompt: string, detail?: string): void {
    el('q-prompt').textContent = prompt;
    const d = el('q-detail');
    d.textContent = detail ?? '';
    d.style.display = detail ? 'block' : 'none';
    el('question').classList.add('visible');
  }

  hideQuestion(): void {
    el('question').classList.remove('visible');
  }

  get questionText(): string {
    return el('question').classList.contains('visible') ? `${el('q-prompt').textContent}|${el('q-detail').textContent}` : '';
  }

  toast(text: string, kind: 'good' | 'soft' | 'info' = 'info'): void {
    const t = el('toast');
    t.textContent = text;
    t.className = `visible ${kind}`;
    this.toastTimer = 1.9;
  }

  /** A line spoken by another character, shown along the bottom of the screen. */
  caption(speaker: string, text: string, seconds = 5): void {
    el('caption-who').textContent = speaker;
    el('caption-text').textContent = text;
    el('caption').classList.add('visible');
    this.captionText = text;
    this.captionTimer = seconds;
  }

  /** Affan's speech bubble. */
  bubble(text: string, seconds = 2.6): void {
    el('bubble-text').textContent = text;
    el('bubble').classList.add('visible');
    this.bubbleTimer = seconds;
  }

  titleCard(title: string, subtitle: string, seconds = 3): void {
    el('card-title').textContent = title;
    el('card-sub').textContent = subtitle;
    const c = el('title-card');
    c.classList.add('visible');
    window.setTimeout(() => c.classList.remove('visible'), seconds * 1000);
  }

  update(dt: number): void {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) el('toast').classList.remove('visible');
    }
    if (this.captionTimer > 0) {
      this.captionTimer -= dt;
      if (this.captionTimer <= 0) el('caption').classList.remove('visible');
    }
    if (this.bubbleTimer > 0) {
      this.bubbleTimer -= dt;
      if (this.bubbleTimer <= 0) el('bubble').classList.remove('visible');
    }
  }

  // ---- Quiz -----------------------------------------------------------------------

  /** Show answer buttons; resolves when the correct one is chosen (any number of tries). */
  quiz(q: ChoiceQuestion, onRight: () => void, onWrong: () => void): Promise<void> {
    this.quizQuestion = q;
    this.onRight = onRight;
    this.onWrong = onWrong;
    el('quiz-prompt').textContent = q.prompt;
    el('quiz-detail').textContent = q.detail ?? '';
    const wrap = el('quiz-options');
    wrap.innerHTML = '';
    q.options.forEach((opt, i) => {
      const b = document.createElement('button');
      b.className = `quiz-option c${i % 4}`;
      b.dataset.value = String(opt);
      b.innerHTML = `<span class="key">${i + 1}</span>${opt}`;
      b.addEventListener('click', () => this.answer(i));
      wrap.appendChild(b);
    });
    el('quiz').classList.add('visible');
    return new Promise((resolve) => {
      this.quizResolve = resolve;
    });
  }

  get quizOpen(): boolean {
    return this.quizQuestion !== null;
  }

  /** Choose option i (0-based). Used by taps, clicks and the 1-4 keys. */
  answer(i: number): void {
    const q = this.quizQuestion;
    if (!q || i < 0 || i >= q.options.length) return;
    const btn = el('quiz-options').children[i] as HTMLButtonElement;
    if (btn.disabled) return;
    if (q.options[i] === q.answer) {
      btn.classList.add('right');
      this.onRight?.();
      this.quizQuestion = null;
      const resolve = this.quizResolve;
      this.quizResolve = null;
      window.setTimeout(() => {
        el('quiz').classList.remove('visible');
        resolve?.();
      }, 900);
    } else {
      // A second chance: the wrong option is gently set aside and the child tries again.
      btn.classList.add('wrong');
      btn.disabled = true;
      this.onWrong?.();
    }
  }

  // ---- Results ------------------------------------------------------------------------

  showComplete(o: {
    title: string; subtitle: string; stars: number; maxStars: number; coins: number;
    badge?: { name: string; emoji: string }; nextLabel: string | null; trophy?: boolean;
  }): void {
    el('screen-complete').classList.toggle('trophy', !!o.trophy);
    el('complete-title').textContent = o.title;
    el('complete-sub').textContent = o.subtitle;
    const stars = el('complete-stars');
    stars.innerHTML = '';
    for (let i = 0; i < o.maxStars; i++) {
      const s = document.createElement('span');
      s.className = `big-star${i < o.stars ? ' earned' : ''}`;
      s.style.animationDelay = `${0.25 + i * 0.28}s`;
      s.textContent = '⭐';
      stars.appendChild(s);
    }
    el('complete-coins').textContent = `🪙 ${o.coins}`;
    const badge = el('complete-badge');
    if (o.badge) {
      badge.style.display = 'flex';
      el('badge-emoji').textContent = o.badge.emoji;
      el('badge-name').textContent = o.badge.name;
    } else {
      badge.style.display = 'none';
    }
    const next = el('btn-next');
    next.style.display = o.nextLabel ? 'inline-flex' : 'none';
    if (o.nextLabel) next.textContent = o.nextLabel;
    this.show('complete');
  }

  setLoading(text: string): void {
    el('loading-text').textContent = text;
  }
}

const TEMPLATE = `
<div id="hud">
  <div id="hud-left"><div id="hearts" aria-label="Nyawa"></div></div>
  <div id="hud-center"><div id="stage-label"></div></div>
  <div id="hud-right">
    <div class="counter"><span>⭐</span><b id="count-stars">0</b></div>
    <div class="counter"><span>🪙</span><b id="count-coins">0</b></div>
    <button id="btn-pause" class="round-btn" aria-label="Jeda">⏸</button>
  </div>
  <div id="question">
    <button id="q-replay" class="replay-btn" aria-label="Dengar soalan sekali lagi">🔊</button>
    <div id="q-text"><div id="q-prompt"></div><div id="q-detail"></div></div>
  </div>
  <div id="bubble"><span class="bubble-face">🧒</span><span id="bubble-text"></span></div>
</div>
<div id="toast"></div>
<div id="caption"><b id="caption-who"></b><span id="caption-text"></span></div>
<div id="title-card"><div id="card-title"></div><div id="card-sub"></div></div>

<div id="quiz">
  <div class="quiz-box">
    <div class="quiz-head"><button id="quiz-replay" class="replay-btn" aria-label="Dengar soalan sekali lagi">🔊</button><div id="quiz-prompt"></div></div>
    <div id="quiz-detail"></div>
    <div id="quiz-options"></div>
  </div>
</div>

<div id="screen-loading" class="screen visible">
  <div class="logo small"><span class="the">The</span><span class="curious">Curious</span><span class="affan">Affan</span></div>
  <div class="loader"><div class="loader-bar"></div></div>
  <div id="loading-text">Memuatkan...</div>
</div>

<div id="screen-menu" class="screen">
  <div class="menu-side">
    <div class="logo"><span class="the">The</span><span class="curious">Curious</span><span class="affan">Affan</span></div>
    <div class="subtitle">Quest for Knowledge</div>
    <div class="tagline">Belajar, Teroka, Lompat dan Temui!</div>
    <div class="menu-buttons">
      <button id="btn-play" class="big-btn primary">▶ Main</button>
      <button id="btn-worlds" class="big-btn">🗺️ Pilih Dunia</button>
      <button id="btn-settings" class="big-btn">⚙️ Tetapan</button>
    </div>
  </div>
</div>

<div id="screen-worlds" class="screen panel-screen">
  <h2>Pilih Dunia</h2>
  <div id="world-grid"></div>
  <button id="btn-worlds-back" class="big-btn">⬅ Kembali</button>
</div>

<div id="screen-settings" class="screen panel-screen">
  <div class="panel">
    <h2>Tetapan</h2>
    <label class="slider-row"><span>🎵 Muzik</span><input id="vol-music" type="range" min="0" max="100" /></label>
    <label class="slider-row"><span>🔔 Kesan bunyi</span><input id="vol-sfx" type="range" min="0" max="100" /></label>
    <label class="slider-row"><span>🗣️ Suara</span><input id="vol-voice" type="range" min="0" max="100" /></label>
    <button id="btn-mute" class="big-btn">🔊 Bunyi: Buka</button>
    <div class="controls-help">
      <b>Kawalan</b>
      <span>⌨️ W A S D / anak panah: bergerak · Space: lompat · Shift: lari</span>
      <span>📱 Kayu bedik: bergerak · ⬆: lompat · 🏃: lari</span>
    </div>
    <button id="btn-settings-back" class="big-btn primary">⬅ Kembali</button>
  </div>
</div>

<div id="screen-pause" class="screen panel-screen">
  <div class="panel">
    <h2>Rehat sebentar</h2>
    <button id="btn-resume" class="big-btn primary">▶ Sambung main</button>
    <button id="btn-restart" class="big-btn">🔄 Mula semula</button>
    <button id="btn-pause-settings" class="big-btn">⚙️ Tetapan</button>
    <button id="btn-quit" class="big-btn">🏠 Menu utama</button>
  </div>
</div>

<div id="screen-complete" class="screen panel-screen">
  <div class="panel celebrate">
    <div id="trophy">
      <svg viewBox="0 0 120 130" aria-hidden="true">
        <defs><linearGradient id="gold" x1="0" x2="1"><stop offset="0" stop-color="#ffd43b"/><stop offset="0.5" stop-color="#fff3bf"/><stop offset="1" stop-color="#f59f00"/></linearGradient></defs>
        <path d="M30 14h60v30c0 20-13 34-30 34S30 64 30 44z" fill="url(#gold)" stroke="#b86e00" stroke-width="4" stroke-linejoin="round"/>
        <path d="M30 22H12c0 22 8 32 22 34M90 22h18c0 22-8 32-22 34" fill="none" stroke="#b86e00" stroke-width="7" stroke-linecap="round"/>
        <path d="M30 22H12c0 22 8 32 22 34M90 22h18c0 22-8 32-22 34" fill="none" stroke="#ffd43b" stroke-width="3" stroke-linecap="round"/>
        <rect x="52" y="76" width="16" height="18" fill="#f59f00" stroke="#b86e00" stroke-width="4"/>
        <rect x="34" y="94" width="52" height="14" rx="5" fill="url(#gold)" stroke="#b86e00" stroke-width="4"/>
        <rect x="26" y="108" width="68" height="16" rx="5" fill="#7048e8" stroke="#3b2a8a" stroke-width="4"/>
        <path d="M60 24l6.5 13 14.4 2.1-10.4 10.2 2.4 14.3L60 56.8l-12.9 6.8 2.4-14.3-10.4-10.2 14.4-2.1z" fill="#fff" stroke="#f59f00" stroke-width="2.5" stroke-linejoin="round"/>
      </svg>
      <div id="trophy-name">THE CURIOUS AFFAN</div>
      <div id="trophy-title">Trofi Peneroka Agung</div>
      <div id="trophy-en">Master Explorer Trophy</div>
    </div>
    <h2 id="complete-title"></h2>
    <div id="complete-sub"></div>
    <div id="complete-stars"></div>
    <div id="complete-coins"></div>
    <div id="complete-badge"><span id="badge-emoji"></span><span id="badge-name"></span></div>
    <button id="btn-next" class="big-btn primary"></button>
    <button id="btn-complete-menu" class="big-btn">🗺️ Pilih Dunia</button>
  </div>
</div>
`;
