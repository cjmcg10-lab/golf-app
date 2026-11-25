import { expect, test } from 'vitest';
import { filterCourses, type CourseSummary } from './catalog';

const list: CourseSummary[] = [
  {
    id: 'a',
    name: 'Southington Country Club',
    address: '150 Savage Street, Plantsville, CT',
    holes: 18,
    par: 71,
  },
  { id: 'b', name: 'Pine Valley Links', address: 'Hartford, CT', holes: 9, par: 35 },
];

test('emptyQueryListsAll', () => {
  expect(filterCourses(list, '  ').map((c) => c.id)).toEqual(['a', 'b']);
});

test('matchesNameOrTownIgnoringCase', () => {
  expect(filterCourses(list, 'southing').map((c) => c.id)).toEqual(['a']);
  expect(filterCourses(list, 'hartford').map((c) => c.id)).toEqual(['b']);
  expect(filterCourses(list, 'country plantsville').map((c) => c.id)).toEqual(['a']);
  expect(filterCourses(list, 'zzz')).toEqual([]);
});
