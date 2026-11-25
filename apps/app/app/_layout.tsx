import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { pruneAppShell } from '../src/course/offline';
import { SettingsProvider } from '../src/settings/useSettings';
import { colors, fonts } from '../src/theme';

/** Ski-app type: Montserrat headings, Nunito Sans body (Google Fonts, web only). */
function useWebFonts() {
  useEffect(() => {
    if (Platform.OS !== 'web' || document.getElementById('golf-fonts')) return;
    const link = document.createElement('link');
    link.id = 'golf-fonts';
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Nunito+Sans:wght@400;600;700&display=swap';
    document.head.appendChild(link);
    const style = document.createElement('style');
    style.textContent = `body, [dir] { font-family: ${fonts.body}; }`;
    document.head.appendChild(style);
  }, []);
}

export default function RootLayout() {
  useWebFonts();
  useEffect(() => {
    if (Platform.OS === 'web' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => pruneAppShell())
        .catch(() => {});
    }
  }, []);
  return (
    <SettingsProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: fonts.heading },
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
    </SettingsProvider>
  );
}
