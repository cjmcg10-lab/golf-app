import { defineConfig } from 'vitest/config';

// Components are tested on the web renderer: react-native → react-native-web.
export default defineConfig({
  resolve: { alias: { 'react-native': 'react-native-web' } },
  define: { __DEV__: 'false' },
  test: {
    name: 'app',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'app/**/*.test.{ts,tsx}'],
  },
});
