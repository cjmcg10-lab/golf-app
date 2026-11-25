import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { CourseProvider } from '../src/course/CourseProvider';
import { colors } from '../src/theme';

export default function RootLayout() {
  return (
    <CourseProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
    </CourseProvider>
  );
}
