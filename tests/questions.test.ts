import { describe, expect, it } from 'vitest';
import {
  additionQuestion, countQuestion, missingLetterQuestion, missingNumberQuestion, subtractionQuestion,
  type ChoiceQuestion,
} from '../src/edu/questions';

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function checkOptions(q: ChoiceQuestion): void {
  expect(q.options.length).toBe(3);
  expect(new Set(q.options).size).toBe(3);
  expect(q.options.filter((o) => o === q.answer).length).toBe(1);
}

describe('question generators (age 4-6 limits)', () => {
  const rand = seeded(42);

  it('addition stays within 10 and is correct', () => {
    for (let i = 0; i < 2000; i++) {
      const max = [5, 7, 10][i % 3];
      const q = additionQuestion(rand, max);
      const [a, b] = q.detail!.match(/\d+/g)!.map(Number);
      expect(a).toBeGreaterThanOrEqual(1);
      expect(b).toBeGreaterThanOrEqual(1);
      expect(a + b).toBe(q.answer);
      expect(q.answer).toBeLessThanOrEqual(max);
      checkOptions(q);
      q.options.forEach((o) => expect(o).toBeGreaterThanOrEqual(1));
    }
  });

  it('subtraction stays within 10 and never goes negative', () => {
    for (let i = 0; i < 2000; i++) {
      const q = subtractionQuestion(rand, 10);
      const [a, b] = q.detail!.match(/\d+/g)!.map(Number);
      expect(a).toBeLessThanOrEqual(10);
      expect(a - b).toBe(q.answer);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      checkOptions(q);
      q.options.forEach((o) => expect(o).toBeGreaterThanOrEqual(0));
    }
  });

  it('missing letter: consecutive letters, one gap, distractors not already shown', () => {
    for (let i = 0; i < 2000; i++) {
      const q = missingLetterQuestion(rand, [0, 10, 21][i % 3]);
      expect(q.sequence.length).toBe(5);
      for (let k = 1; k < 5; k++) {
        expect(q.sequence[k].charCodeAt(0) - q.sequence[k - 1].charCodeAt(0)).toBe(1);
      }
      expect(q.sequence[q.missingIndex]).toBe(q.answer);
      expect(q.detail!.split('?').length).toBe(2);
      checkOptions(q);
      q.options.filter((o) => o !== q.answer).forEach((o) => {
        expect(q.sequence.includes(o)).toBe(false);
        expect(o).toMatch(/^[A-Z]$/);
      });
    }
  });

  it('first-round missing letter always uses A-E', () => {
    for (let i = 0; i < 200; i++) {
      expect(missingLetterQuestion(rand, 0).sequence.join('')).toBe('ABCDE');
    }
  });

  it('missing number: counting 1-20', () => {
    for (let i = 0; i < 2000; i++) {
      const q = missingNumberQuestion(rand);
      expect(q.answer).toBeGreaterThanOrEqual(1);
      expect(q.answer).toBeLessThanOrEqual(20);
      checkOptions(q);
    }
  });

  it('counting shows exactly as many objects as the answer', () => {
    for (let i = 0; i < 500; i++) {
      const q = countQuestion(rand, 6);
      expect(q.detail!.split(' ').length).toBe(q.answer);
      expect(q.answer).toBeLessThanOrEqual(6);
      checkOptions(q);
    }
  });
});
