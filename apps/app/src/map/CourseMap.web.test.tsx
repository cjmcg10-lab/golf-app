// @vitest-environment jsdom
import type { Course } from '@golf/course-schema';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

const jumpTo = vi.fn();
vi.mock('maplibre-gl', () => {
  class Map {
    touchZoomRotate = { disableRotation() {} };
    addControl() {}
    on(ev: string, cb: () => void) {
      if (ev === 'load') cb();
    }
    addSource() {}
    addLayer() {}
    getSource() {
      return { setData() {} };
    }
    cameraForBounds() {
      return { center: [0, 0], zoom: 17 };
    }
    jumpTo = jumpTo;
    remove() {}
  }
  return { Map, AttributionControl: class {}, setWorkerUrl() {} };
});

const { CourseMap } = await import('./CourseMap.web');

afterEach(cleanup);

const hole = {
  number: 1,
  playLine: [
    [0, 0],
    [0, 0.003],
  ],
  pin: [0, 0.003],
  green: { front: [0, 0.0029], center: [0, 0.003], back: [0, 0.0031] },
};
const course = {
  bounds: [0, 0, 0.01, 0.01],
  holes: [hole, { ...hole, number: 2 }],
} as unknown as Course;
const features = { type: 'FeatureCollection' as const, features: [] };

test('cameraNotResetByGpsUpdates', () => {
  const props = { course, features, holeNumber: 1, target: null, onTapPoint: () => {} };
  const { rerender } = render(<CourseMap {...props} userLocation={[0, 0.001]} />);
  const afterFirst = jumpTo.mock.calls.length;
  expect(afterFirst).toBeGreaterThan(0);
  rerender(<CourseMap {...props} userLocation={[0, 0.0011]} />);
  rerender(<CourseMap {...props} userLocation={[0, 0.0012]} target={[0, 0.002]} />);
  expect(jumpTo.mock.calls.length).toBe(afterFirst);
  rerender(<CourseMap {...props} holeNumber={2} userLocation={[0, 0.0012]} />);
  expect(jumpTo.mock.calls.length).toBe(afterFirst + 1);
});
