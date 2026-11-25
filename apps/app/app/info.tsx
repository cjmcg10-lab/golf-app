import { Stack } from 'expo-router';
import { ScrollView } from 'react-native';
import { CourseGate } from '../src/course/CourseGate';
import { CourseInfo } from '../src/course/CourseInfo';

export default function Info() {
  return (
    <CourseGate>
      {({ course }) => (
        <ScrollView>
          <Stack.Screen options={{ title: 'Course info' }} />
          <CourseInfo course={course} />
        </ScrollView>
      )}
    </CourseGate>
  );
}
