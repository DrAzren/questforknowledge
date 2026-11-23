/** Progress saved in the browser so children can continue where they stopped. */

export interface SaveData {
  version: 1;
  /** Highest world index unlocked (0 = Jungle). */
  unlockedWorld: number;
  /** For each world id: number of stages completed. */
  stagesDone: Record<string, number>;
  /** Best star count per stage id. */
  stageStars: Record<string, number>;
  coins: number;
  badges: string[];
  audio: { music: number; sfx: number; voice: number; muted: boolean };
}

const KEY = 'curious-affan-save-v1';

export function defaultSave(): SaveData {
  return {
    version: 1,
    unlockedWorld: 0,
    stagesDone: {},
    stageStars: {},
    coins: 0,
    badges: [],
    audio: { music: 0.55, sfx: 0.9, voice: 1, muted: false },
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const data = JSON.parse(raw) as Partial<SaveData>;
    if (data.version !== 1) return defaultSave();
    return { ...defaultSave(), ...data, audio: { ...defaultSave().audio, ...data.audio } };
  } catch {
    // Private browsing or blocked storage: play without saving.
    return defaultSave();
  }
}

export function storeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable: progress lasts for this session only */
  }
}

export function totalStars(data: SaveData): number {
  return Object.values(data.stageStars).reduce((a, b) => a + b, 0);
}
