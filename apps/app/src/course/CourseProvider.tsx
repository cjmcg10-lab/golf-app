import type { Course } from '@golf/course-schema';
import type { FeatureCollection } from 'geojson';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { loadCourse } from './loadCourse';

export const COURSE_ID = 'southington-cc';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; course: Course; features: FeatureCollection };

const Ctx = createContext<{ state: State; retry: () => void }>({
  state: { status: 'loading' },
  retry: () => {},
});

export function CourseProvider({ id = COURSE_ID, children }: { id?: string; children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    loadCourse(id)
      .then(({ course, features }) => live && setState({ status: 'ready', course, features }))
      .catch((e: Error) => live && setState({ status: 'error', message: e.message }));
    return () => {
      live = false;
    };
  }, [id, attempt]);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return <Ctx.Provider value={{ state, retry }}>{children}</Ctx.Provider>;
}

export const useCourse = () => useContext(Ctx);
