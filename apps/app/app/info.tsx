import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';
import { CourseGate } from '../src/course/CourseGate';
import { CourseInfo } from '../src/course/CourseInfo';
import { COURSE_ID, CourseProvider } from '../src/course/CourseProvider';

export default function Info() {
  const { course: id } = useLocalSearchParams<{ course?: string }>();
  return (
    <CourseProvider id={id || COURSE_ID}>
      <Stack.Screen options={{ title: 'Course info' }} />
      <CourseGate>
        {({ course }) => (
          <ScrollView>
            <CourseInfo course={course} />
          </ScrollView>
        )}
      </CourseGate>
    </CourseProvider>
  );
}
