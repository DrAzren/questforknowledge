import { JUNGLE_THEME } from './jungle/JungleStage';
import { JungleTreasureStage } from './jungle/JungleTreasure';
import { MissingAlphabetStage } from './jungle/MissingAlphabet';
import { NumberRiverStage } from './jungle/NumberRiver';
import type { WorldDef } from './Stage';

/**
 * The five worlds. World 1 is fully playable; worlds 2-5 are listed so the
 * world map and unlock chain are real, and each becomes playable by adding its
 * stages here (they reuse the same engine, HUD, audio and question systems).
 */
export const WORLDS: WorldDef[] = [
  {
    id: 'jungle',
    index: 0,
    name: 'Hutan Misteri',
    tagline: 'Nombor, huruf dan harta karun',
    emoji: '🌴',
    badge: { id: 'jungle-explorer', name: 'Lencana Peneroka Hutan', emoji: '🏅' },
    theme: JUNGLE_THEME,
    available: true,
    stages: [
      { id: 'jungle-1', name: 'Sungai Nombor', hint: 'Lompat ke batu dengan jawapan yang betul!', create: (g) => new NumberRiverStage(g) },
      { id: 'jungle-2', name: 'Huruf Yang Hilang', hint: 'Cari huruf yang hilang untuk membina jambatan!', create: (g) => new MissingAlphabetStage(g) },
      { id: 'jungle-3', name: 'Harta Karun Hutan', hint: 'Kumpul permata yang betul dan buka peti harta!', create: (g) => new JungleTreasureStage(g) },
    ],
  },
  {
    id: 'desert', index: 1, name: 'Gurun Penemuan', tagline: 'Bentuk, warna dan mengira', emoji: '🏜️',
    badge: { id: 'desert-explorer', name: 'Lencana Peneroka Gurun', emoji: '🏅' },
    theme: JUNGLE_THEME, available: false, stages: [],
  },
  {
    id: 'school', index: 2, name: 'Sekolah Ajaib', tagline: 'Abjad, perkataan dan haiwan', emoji: '🏫',
    badge: { id: 'little-scholar', name: 'Lencana Cendekiawan Cilik', emoji: '🎓' },
    theme: JUNGLE_THEME, available: false, stages: [],
  },
  {
    id: 'volcano', index: 3, name: 'Cabaran Gunung Berapi', tagline: 'Tambah, tolak dan turutan nombor', emoji: '🌋',
    badge: { id: 'fire-explorer', name: 'Lencana Peneroka Api', emoji: '🔥' },
    theme: JUNGLE_THEME, available: false, stages: [],
  },
  {
    id: 'snow', index: 4, name: 'Kerajaan Beku', tagline: 'Cabaran ilmu terhebat', emoji: '❄️',
    badge: { id: 'master-explorer', name: 'Trofi Peneroka Agung', emoji: '🏆' },
    theme: JUNGLE_THEME, available: false, stages: [],
  },
];
