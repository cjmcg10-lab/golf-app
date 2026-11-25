import { Redirect, useLocalSearchParams } from 'expo-router';
import { COURSE_ID } from '../../src/course/CourseProvider';

/** Old links (and the offline shell) still open a hole directly. */
export default function HoleRedirect() {
  const { n } = useLocalSearchParams<{ n: string }>();
  return <Redirect href={`/course/${COURSE_ID}?hole=${encodeURIComponent(n ?? '1')}`} />;
}
