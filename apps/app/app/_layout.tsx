import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { CourseProvider } from '../src/course/CourseProvider';
import { pruneAppShell } from '../src/course/offline';
import { colors } from '../src/theme';

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === 'web' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => pruneAppShell())
        .catch(() => {});
    }
  }, []);
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
