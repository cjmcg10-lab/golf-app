import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { validateCourse } from '../src/index';

const dir = new URL('./fixtures/mini/', import.meta.url);
const load = () => ({
  course: JSON.parse(readFileSync(new URL('course.json', dir), 'utf8')),
  features: JSON.parse(readFileSync(new URL('features.geojson', dir), 'utf8')),
});
const errorsAt = (issues: ReturnType<typeof validateCourse>, path: string) =>
  issues.filter((i) => i.level === 'error' && i.path === path);

describe('validateCourse', () => {
  test('validMini', () => {
    const { course, features } = load();
    expect(validateCourse(course, features)).toEqual([]);
  });

  test('parSumMismatch', () => {
    const { course, features } = load();
    course.par = 8;
    expect(errorsAt(validateCourse(course, features), 'par')).toHaveLength(1);
  });

  test('holeMissingPin', () => {
    const { course, features } = load();
    delete course.holes[0].pin;
    expect(errorsAt(validateCourse(course, features), 'holes[0].pin')).toHaveLength(1);
  });

  test('featureIdUnknown', () => {
    const { course, features } = load();
    course.holes[0].featureIds.push('nope');
    expect(errorsAt(validateCourse(course, features), 'holes[0].featureIds')).toHaveLength(1);
  });

  test('badPhone', () => {
    const { course, features } = load();
    course.contacts[0].phone = '860-628-7032';
    expect(errorsAt(validateCourse(course, features), 'contacts[0].phone')).toHaveLength(1);
  });

  test('yardsFarFromMeasured', () => {
    const { course, features } = load();
    course.holes[0].yards.white = 400;
    const issues = validateCourse(course, features);
    expect(
      issues.filter((i) => i.level === 'warning' && i.path === 'holes[0].yards.white'),
    ).toHaveLength(1);
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  test('confidenceOutOfRange', () => {
    const { course, features } = load();
    features.features[0].properties.confidence = 1.5;
    expect(errorsAt(validateCourse(course, features), 'features[0].confidence')).toHaveLength(1);
  });

  test('notAnObject', () => {
    expect(validateCourse(null, { type: 'FeatureCollection', features: [] })[0]?.level).toBe(
      'error',
    );
  });
});
