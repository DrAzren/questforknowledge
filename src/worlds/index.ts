import { ColourCarpetsStage } from './desert/ColourCarpets';
import { DesertCountingStage } from './desert/DesertCounting';
import { DESERT_THEME } from './desert/DesertStage';
import { ShapeGatesStage } from './desert/ShapeGates';
import { JUNGLE_THEME } from './jungle/JungleStage';
import { JungleTreasureStage } from './jungle/JungleTreasure';
import { MissingAlphabetStage } from './jungle/MissingAlphabet';
import { AnimalMatchStage } from './school/AnimalMatch';
import { LetterMatchStage } from './school/LetterMatch';
import { SCHOOL_THEME } from './school/SchoolStage';
import { WordBuilderStage } from './school/WordBuilder';
import { NumberRiverStage } from './jungle/NumberRiver';
import { AlphabetSnowStage } from './snow/AlphabetSnow';
import { PenguinLakeStage } from './snow/PenguinLake';
import { SnowGuardianStage } from './snow/SnowGuardian';
import { SNOW_THEME } from './snow/SnowStage';
import { CrystalCaveStage } from './volcano/CrystalCave';
import { LavaBridgesStage } from './volcano/LavaBridges';
import { SummitSequenceStage } from './volcano/SummitSequence';
import { VOLCANO_THEME } from './volcano/VolcanoStage';
import type { WorldDef } from './Stage';

/**
 * The five worlds, in the order they unlock. A world is a theme plus a list of
 * stages; every stage reuses the same engine, HUD, audio and question systems.
 */
export const WORLDS: WorldDef[] = [
  {
    id: 'jungle',
    index: 0,
    name: 'Hutan Misteri',
    tagline: 'Nombor, huruf dan harta karun',
    emoji: '🌴',
    badge: { id: 'jungle-explorer', name: 'Lencana Peneroka Hutan', emoji: '🏅' },
    introLine: { text: 'Wah! Cantiknya hutan ni! Jom kita teroka!', voice: 'intro_jungle' },
    theme: JUNGLE_THEME,
    available: true,
    stages: [
      { id: 'jungle-1', name: 'Sungai Nombor', hint: 'Lompat ke batu dengan jawapan yang betul!', create: (g) => new NumberRiverStage(g) },
      { id: 'jungle-2', name: 'Huruf Yang Hilang', hint: 'Cari huruf yang hilang untuk membina jambatan!', create: (g) => new MissingAlphabetStage(g) },
      { id: 'jungle-3', name: 'Harta Karun Hutan', hint: 'Kumpul permata yang betul dan buka peti harta!', create: (g) => new JungleTreasureStage(g) },
    ],
  },
  {
    id: 'desert',
    index: 1,
    name: 'Gurun Penemuan',
    tagline: 'Bentuk, warna dan mengira',
    emoji: '🏜️',
    badge: { id: 'desert-explorer', name: 'Lencana Peneroka Gurun', emoji: '🏅' },
    introLine: { text: 'Wah! Luasnya gurun ni! Jom cari harta karun!', voice: 'intro_desert' },
    theme: DESERT_THEME,
    available: true,
    stages: [
      { id: 'desert-1', name: 'Pintu Bentuk', hint: 'Lompat ke bentuk yang betul untuk membuka pintu!', create: (g) => new ShapeGatesStage(g) },
      { id: 'desert-2', name: 'Permaidani Warna', hint: 'Naik permaidani dengan warna yang betul!', create: (g) => new ColourCarpetsStage(g) },
      { id: 'desert-3', name: 'Kira di Gurun', hint: 'Kira dan lompat ke gendang dengan nombor yang betul!', create: (g) => new DesertCountingStage(g) },
    ],
  },
  {
    id: 'school',
    index: 2,
    name: 'Sekolah Ajaib',
    tagline: 'Abjad, perkataan dan haiwan',
    emoji: '🏫',
    badge: { id: 'little-scholar', name: 'Lencana Cendekiawan Cilik', emoji: '🎓' },
    introLine: { text: 'Wah! Sekolah ajaib! Jom kita belajar!', voice: 'intro_school' },
    theme: SCHOOL_THEME,
    available: true,
    stages: [
      { id: 'school-1', name: 'Huruf Besar dan Kecil', hint: 'Lompat ke blok dengan huruf kecil yang sama!', create: (g) => new LetterMatchStage(g) },
      { id: 'school-2', name: 'Bina Perkataan', hint: 'Kumpul huruf mengikut urutan untuk mengeja perkataan!', create: (g) => new WordBuilderStage(g) },
      { id: 'school-3', name: 'Kenal Haiwan', hint: 'Cari haiwan yang betul, dengar bunyinya!', create: (g) => new AnimalMatchStage(g) },
    ],
  },
  {
    id: 'volcano',
    index: 3,
    name: 'Cabaran Gunung Berapi',
    tagline: 'Tambah, tolak dan turutan nombor',
    emoji: '🌋',
    badge: { id: 'fire-explorer', name: 'Lencana Peneroka Api', emoji: '🔥' },
    introLine: { text: 'Wah! Gunung berapi! Jom kita daki!', voice: 'intro_volcano' },
    theme: VOLCANO_THEME,
    available: true,
    stages: [
      { id: 'volcano-1', name: 'Jambatan Lava', hint: 'Lompat ke batu dengan jawapan tambah yang betul!', create: (g) => new LavaBridgesStage(g) },
      { id: 'volcano-2', name: 'Gua Kristal', hint: 'Kira kristal yang tinggal, naik wap yang betul!', create: (g) => new CrystalCaveStage(g) },
      { id: 'volcano-3', name: 'Puncak Gunung', hint: 'Cari nombor yang hilang, lompat batu ikut turutan!', create: (g) => new SummitSequenceStage(g) },
    ],
  },
  {
    id: 'snow',
    index: 4,
    name: 'Kerajaan Beku',
    tagline: 'Cabaran ilmu terhebat',
    emoji: '❄️',
    badge: { id: 'master-explorer', name: 'Trofi Peneroka Agung', emoji: '🏆' },
    introLine: { text: 'Wah! Banyaknya salji! Jom kita teroka!', voice: 'intro_snow' },
    theme: SNOW_THEME,
    available: true,
    stages: [
      { id: 'snow-1', name: 'Abjad Salji', hint: 'Lompat ke blok ais dengan huruf yang betul!', create: (g) => new AlphabetSnowStage(g) },
      { id: 'snow-2', name: 'Tasik Penguin', hint: 'Kira penguin dan pilih nombor yang betul!', create: (g) => new PenguinLakeStage(g) },
      { id: 'snow-3', name: 'Penjaga Salji', hint: 'Jawab lima soalan untuk membuka Kristal Beku!', create: (g) => new SnowGuardianStage(g) },
    ],
  },
];
