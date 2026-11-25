import { validateCourse, type Course } from '@golf/course-schema';
import type { FeatureCollection } from 'geojson';

export class CourseLoadError extends Error {
  constructor(
    readonly kind: 'network' | 'invalid',
    message: string,
  ) {
    super(message);
    this.name = 'CourseLoadError';
  }
}

async function getJson(url: string, fetcher: typeof fetch): Promise<unknown> {
  let res: Response;
  try {
    res = await fetcher(url);
  } catch (e) {
    throw new CourseLoadError('network', `Could not reach ${url}: ${(e as Error).message}`);
  }
  if (!res.ok) throw new CourseLoadError('network', `${url} returned ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new CourseLoadError('invalid', `${url} is not valid JSON`);
  }
}

export async function loadCourse(
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<{ course: Course; features: FeatureCollection }> {
  const base = `/courses/${id}`;
  const [course, features] = await Promise.all([
    getJson(`${base}/course.json`, fetcher),
    getJson(`${base}/features.geojson`, fetcher),
  ]);
  const errors = validateCourse(course, features as FeatureCollection).filter(
    (i) => i.level === 'error',
  );
  if (errors.length) {
    throw new CourseLoadError(
      'invalid',
      `Course data has ${errors.length} error(s): ${errors[0]!.path} ${errors[0]!.message}`,
    );
  }
  return { course: course as Course, features: features as FeatureCollection };
}
