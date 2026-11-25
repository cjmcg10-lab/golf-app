import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { CourseLoadError, loadCourse } from './loadCourse';

const fixture = (name: string) =>
  readFileSync(
    resolve(__dirname, '../../../../packages/course-schema/test/fixtures/mini', name),
    'utf8',
  );

const okFetch = (async (url: string) =>
  new Response(
    fixture(url.endsWith('course.json') ? 'course.json' : 'features.geojson'),
  )) as typeof fetch;

describe('loadCourse', () => {
  test('loadsValidCourse', async () => {
    const { course, features } = await loadCourse('mini', okFetch);
    expect(course.name).toBe('Mini Golf Club');
    expect(features.features).toHaveLength(1);
  });

  test('requestsCoursePaths', async () => {
    const urls: string[] = [];
    const spy = (async (url: string) => {
      urls.push(url);
      return okFetch(url);
    }) as typeof fetch;
    await loadCourse('mini', spy);
    expect(urls.sort()).toEqual(['/courses/mini/course.json', '/courses/mini/features.geojson']);
  });

  test('networkErrorThrows', async () => {
    const down = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    await expect(loadCourse('mini', down)).rejects.toMatchObject({ kind: 'network' });
    await expect(loadCourse('mini', down)).rejects.toBeInstanceOf(CourseLoadError);
  });

  test('httpErrorIsNetwork', async () => {
    const notFound = (async () => new Response('nope', { status: 404 })) as typeof fetch;
    await expect(loadCourse('mini', notFound)).rejects.toMatchObject({ kind: 'network' });
  });

  test('invalidCourseThrows', async () => {
    const bad = (async (url: string) => {
      if (url.endsWith('course.json')) {
        const c = JSON.parse(fixture('course.json'));
        c.par = 99;
        return new Response(JSON.stringify(c));
      }
      return new Response(fixture('features.geojson'));
    }) as typeof fetch;
    await expect(loadCourse('mini', bad)).rejects.toMatchObject({ kind: 'invalid' });
  });
});
