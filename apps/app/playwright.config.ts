import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// Cloud sessions ship a pre-installed Chromium; CI uses Playwright's own download.
const preinstalled = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 390, height: 844 },
    trace: 'off',
    launchOptions: {
      ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'npx serve -s dist -l 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
  },
});
