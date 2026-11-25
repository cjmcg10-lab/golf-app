// @vitest-environment jsdom
import type { Course, Hole } from '@golf/course-schema';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { HazardList } from './HazardList';
import { HoleHeader } from './HoleHeader';
import { HoleNav } from './HoleNav';

afterEach(cleanup);

const hole = (over: Partial<Hole> = {}): Hole => ({
  number: 4,
  par: 5,
  handicap: 3,
  playLine: [
    [0, 0],
    [0, 0.001],
  ],
  measuredYards: 479,
  yards: { blue: 488 },
  pin: [0, 0.001],
  green: { front: [0, 0.001], center: [0, 0.001], back: [0, 0.001] },
  featureIds: [],
  ...over,
});
const course = { teeSets: [{ id: 'blue', name: 'Blue' }], holes: Array(18) } as unknown as Course;

test('headerShowsParAndYards', () => {
  render(<HoleHeader hole={hole()} course={course} />);
  expect(screen.getByText('Hole 4')).toBeTruthy();
  expect(screen.getByText('Par 5 · 488 yds (Blue) · HCP 3')).toBeTruthy();
});

test('handicapHiddenWhenNull', () => {
  render(<HoleHeader hole={hole({ handicap: null })} course={course} />);
  expect(screen.getByText('Par 5 · 488 yds (Blue)')).toBeTruthy();
  expect(screen.queryByText(/HCP/)).toBeNull();
});

test('holeWithoutHazards', () => {
  render(<HazardList hazards={[]} />);
  expect(screen.getByText('No bunkers or water ahead')).toBeTruthy();
});

test('hazardRows', () => {
  render(
    <HazardList hazards={[{ id: 'a', kind: 'water', frontYards: 101.6, backYards: 130.2 }]} />,
  );
  expect(screen.getByText('Water')).toBeTruthy();
  expect(screen.getByText('102 – 130')).toBeTruthy();
});

test('nextFromHole18Disabled', () => {
  const go = vi.fn();
  render(<HoleNav number={18} total={18} onGo={go} />);
  fireEvent.click(screen.getByLabelText('Next hole'));
  expect(go).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText('Previous hole'));
  expect(go).toHaveBeenCalledWith(17);
});

test('prevFromHole1Disabled', () => {
  const go = vi.fn();
  render(<HoleNav number={1} total={18} onGo={go} />);
  fireEvent.click(screen.getByLabelText('Previous hole'));
  expect(go).not.toHaveBeenCalled();
});
