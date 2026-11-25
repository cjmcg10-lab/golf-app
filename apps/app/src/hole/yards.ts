import type { Course, Hole } from '@golf/course-schema';

/**
 * Scorecard yardage from the chosen tee set, else the first tee set that has one (the back tees),
 * else the mapped length.
 */
export function displayYards(
  hole: Hole,
  course: Course,
  teeId?: string | null,
): { yards: number; tee: string | null } {
  const chosen = course.teeSets.find((t) => t.id === teeId);
  const order = chosen ? [chosen, ...course.teeSets] : course.teeSets;
  for (const t of order) {
    const y = hole.yards[t.id];
    if (typeof y === 'number') return { yards: y, tee: t.name };
  }
  return { yards: hole.measuredYards, tee: null };
}
