import type { Course, Hole } from '@golf/course-schema';

/** Scorecard yardage from the first tee set that has one (the back tees), else the mapped length. */
export function displayYards(hole: Hole, course: Course): { yards: number; tee: string | null } {
  for (const t of course.teeSets) {
    const y = hole.yards[t.id];
    if (typeof y === 'number') return { yards: y, tee: t.name };
  }
  return { yards: hole.measuredYards, tee: null };
}
