/**
 * Question generators for ages 4-6. Every generator takes a random source so
 * tests can check thousands of questions deterministically.
 */

export interface ChoiceQuestion<T extends string | number = string | number> {
  /** Short text shown in the big question panel. */
  prompt: string;
  /** Optional line underneath (e.g. the sequence with a gap). */
  detail?: string;
  answer: T;
  /** Shuffled options, always containing the answer exactly once. */
  options: T[];
  /** Name of the narration clip that reads this question aloud, if one exists. */
  voice?: string;
}

export type Rand = () => number;

export function randInt(rand: Rand, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

export function shuffle<T>(rand: Rand, items: T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick distractors close to the answer: near-misses teach more than random numbers. */
function numberOptions(rand: Rand, answer: number, count: number, min: number, max: number): number[] {
  const pool: number[] = [];
  for (let d = 1; d <= 3; d++) {
    if (answer - d >= min) pool.push(answer - d);
    if (answer + d <= max) pool.push(answer + d);
  }
  const picks = shuffle(rand, pool).slice(0, count - 1);
  return shuffle(rand, [answer, ...picks]);
}

/** a + b with the sum no larger than maxSum (addition within 10). */
export function additionQuestion(rand: Rand, maxSum: number, optionCount = 3): ChoiceQuestion<number> {
  const sum = randInt(rand, 2, Math.min(10, maxSum));
  const a = randInt(rand, 1, sum - 1);
  const b = sum - a;
  return {
    prompt: `Affan, berapakah ${a} + ${b}?`,
    detail: `${a} + ${b} = ?`,
    answer: sum,
    options: numberOptions(rand, sum, optionCount, 1, 12),
  };
}

/**
 * Addition questions that have a recorded narration, grouped by difficulty
 * (sums up to 5, up to 7, up to 10). Drawing from a fixed pool is what lets
 * every question be spoken with a natural, pre-recorded voice.
 */
export const ADDITION_POOL: [number, number][][] = [
  [[2, 1], [1, 3], [2, 2], [3, 2], [1, 4], [2, 3]],
  [[3, 3], [4, 2], [5, 1], [4, 3], [2, 5], [6, 1]],
  [[4, 4], [5, 3], [6, 2], [5, 4], [7, 2], [5, 5], [6, 4], [3, 6]],
];

/** A spoken addition question from tier 0 (easiest) to 2. */
export function spokenAdditionQuestion(rand: Rand, tier: number, optionCount = 3): ChoiceQuestion<number> {
  const pool = ADDITION_POOL[Math.max(0, Math.min(ADDITION_POOL.length - 1, tier))];
  const [a, b] = pool[Math.floor(rand() * pool.length)];
  return {
    prompt: `Affan, berapakah ${a} + ${b}?`,
    detail: `${a} + ${b} = ?`,
    answer: a + b,
    options: numberOptions(rand, a + b, optionCount, 1, 12),
    voice: `q_add_${a}_${b}`,
  };
}

/** Subtraction questions that have a recorded narration, grouped by difficulty. All stay within 10. */
export const SUBTRACTION_POOL: [number, number][][] = [
  [[3, 1], [4, 2], [5, 2], [5, 3], [6, 1]],
  [[6, 3], [7, 2], [7, 4], [8, 3], [8, 5]],
  [[9, 4], [9, 6], [10, 3], [10, 5], [10, 7]],
];

/** A spoken subtraction question from tier 0 (easiest) to 2. `parts` gives a and b for picture displays. */
export function spokenSubtractionQuestion(rand: Rand, tier: number, optionCount = 3): ChoiceQuestion<number> & { parts: [number, number] } {
  const pool = SUBTRACTION_POOL[Math.max(0, Math.min(SUBTRACTION_POOL.length - 1, tier))];
  const [a, b] = pool[Math.floor(rand() * pool.length)];
  return {
    prompt: `Affan, berapakah ${a} − ${b}?`,
    detail: `${a} − ${b} = ?`,
    answer: a - b,
    options: numberOptions(rand, a - b, optionCount, 0, 10),
    voice: `q_sub_${a}_${b}`,
    parts: [a, b],
  };
}

/** Five numbers counting up by one with one missing (never the first), starting between minStart and maxStart. */
export function numberSequenceQuestion(
  rand: Rand, minStart: number, maxStart: number, optionCount = 3,
): ChoiceQuestion<number> & { sequence: number[]; missingIndex: number } {
  const start = randInt(rand, minStart, maxStart);
  const sequence = [0, 1, 2, 3, 4].map((i) => start + i);
  const missingIndex = randInt(rand, 1, 4);
  const answer = sequence[missingIndex];
  return {
    prompt: 'Nombor apakah yang hilang?',
    detail: sequence.map((n, i) => (i === missingIndex ? '?' : String(n))).join('  '),
    answer,
    options: numberOptions(rand, answer, optionCount, 1, 20),
    voice: 'q_nombor_hilang',
    sequence,
    missingIndex,
  };
}

/** a - b with a no larger than max (subtraction within 10), never negative. */
export function subtractionQuestion(rand: Rand, max: number, optionCount = 3): ChoiceQuestion<number> {
  const a = randInt(rand, 2, Math.min(10, max));
  const b = randInt(rand, 1, a - 1);
  return {
    prompt: `Affan, berapakah ${a} - ${b}?`,
    detail: `${a} − ${b} = ?`,
    answer: a - b,
    options: numberOptions(rand, a - b, optionCount, 0, 10),
  };
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export interface SequenceQuestion extends ChoiceQuestion<string> {
  /** The full sequence, e.g. ['A','B','C','D','E']. */
  sequence: string[];
  /** Index of the missing item. */
  missingIndex: number;
}

/**
 * Five consecutive letters with one missing, e.g. A B C ? E.
 * `maxStart` limits how far into the alphabet the run may begin (0 = always A).
 */
export function missingLetterQuestion(rand: Rand, maxStart = 21, optionCount = 3): SequenceQuestion {
  const start = randInt(rand, 0, Math.min(21, maxStart));
  const sequence = ALPHABET.slice(start, start + 5).split('');
  const missingIndex = randInt(rand, 1, 4);
  const answer = sequence[missingIndex];
  // Distractors are letters outside the visible run, near the answer.
  const pool: string[] = [];
  for (let d = 1; d <= 6 && pool.length < 6; d++) {
    for (const idx of [start + missingIndex - d, start + missingIndex + d]) {
      const ch = ALPHABET[idx];
      if (ch && !sequence.includes(ch) && !pool.includes(ch)) pool.push(ch);
    }
  }
  const picks = shuffle(rand, pool).slice(0, optionCount - 1);
  const shown = sequence.map((c, i) => (i === missingIndex ? '?' : c));
  return {
    prompt: 'Huruf apakah yang hilang?',
    detail: shown.join('  '),
    answer,
    options: shuffle(rand, [answer, ...picks]),
    voice: 'q_huruf_hilang',
    sequence,
    missingIndex,
  };
}

/** 1, 2, 3, ?, 5 style number sequences. */
export function missingNumberQuestion(rand: Rand, maxStart = 15, optionCount = 3): ChoiceQuestion<number> {
  const start = randInt(rand, 1, maxStart);
  const seq = [0, 1, 2, 3, 4].map((i) => start + i);
  const missing = randInt(rand, 1, 4);
  const answer = seq[missing];
  const shown = seq.map((n, i) => (i === missing ? '?' : String(n)));
  return {
    prompt: 'Nombor apakah yang hilang?',
    detail: shown.join('  '),
    answer,
    options: numberOptions(rand, answer, optionCount, 0, 20),
  };
}

/** "Count the stars" with the objects drawn as emoji. */
export function countQuestion(rand: Rand, max = 10, emoji = '⭐', noun = 'bintang', optionCount = 3): ChoiceQuestion<number> {
  const n = randInt(rand, 2, max);
  return {
    prompt: `Kira ${noun}. Ada berapa?`,
    detail: Array.from({ length: n }, () => emoji).join(' '),
    answer: n,
    options: numberOptions(rand, n, optionCount, 1, 20),
    voice: noun === 'bintang' ? 'q_kira_bintang' : undefined,
  };
}

/** Feedback lines with the voice clip that says exactly those words (n_ = narrator, others = Affan). */
export const PRAISE_LINES: { text: string; voice: string }[] = [
  { text: 'Bagus Affan!', voice: 'n_bagus' },
  { text: 'Hebatnya!', voice: 'n_hebatnya' },
  { text: 'Pandainya Affan!', voice: 'n_pandainya' },
  { text: 'Betul!', voice: 'betul' },
  { text: 'Wah, hebat!', voice: 'wah_hebat' },
];
export const ENCOURAGE_LINES: { text: string; voice: string }[] = [
  { text: 'Cuba lagi, Affan!', voice: 'n_cuba_lagi' },
  { text: 'Tak mengapa, kita belajar sama-sama!', voice: 'n_tak_mengapa' },
  { text: 'Hampir betul! Cuba sekali lagi!', voice: 'n_hampir' },
  { text: 'Oops! Cuba lagi!', voice: 'oops_cuba_lagi' },
];
export const PRAISE = PRAISE_LINES.map((l) => l.text);
export const ENCOURAGE = ENCOURAGE_LINES.map((l) => l.text);

/** Exported for tests and stages that need the same near-miss distractors. */
export function numberChoices(rand: Rand, answer: number, count: number, min: number, max: number): number[] {
  return numberOptions(rand, answer, count, min, max);
}

export function pick<T>(rand: Rand, items: T[]): T {
  return items[Math.floor(rand() * items.length)];
}
