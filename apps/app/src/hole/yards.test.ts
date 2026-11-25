import type { Course, Hole } from '@golf/course-schema';
import { expect, test } from 'vitest';
import { displayYards } from './yards';

const hole = { measuredYards: 93, yards: { blue: 120, white: 96 } } as unknown as Hole;
const course = (ids: string[]) =>
  ({ teeSets: ids.map((id) => ({ id, name: id.toUpperCase() })) }) as unknown as Course;

test('usesFirstTeeSetWithYards', () => {
  expect(displayYards(hole, course(['blue', 'white']))).toEqual({ yards: 120, tee: 'BLUE' });
});

test('skipsTeeSetWithoutYards', () => {
  expect(displayYards(hole, course(['black', 'white']))).toEqual({ yards: 96, tee: 'WHITE' });
});

test('fallsBackToMeasured', () => {
  expect(displayYards(hole, course([]))).toEqual({ yards: 93, tee: null });
});

test('chosenTeeSetWins', () => {
  expect(displayYards(hole, course(['blue', 'white']), 'white')).toEqual({
    yards: 96,
    tee: 'WHITE',
  });
});

test('chosenTeeSetWithoutYardsFallsBack', () => {
  expect(displayYards(hole, course(['blue', 'red']), 'red')).toEqual({ yards: 120, tee: 'BLUE' });
});
