import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: '.',
  testMatch: 'quick-join-browser.mjs',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', {
    open: 'never',
    outputFolder: fileURLToPath(new URL('../playwright-report', import.meta.url)),
  }]],
  outputDir: fileURLToPath(new URL('../test-results', import.meta.url)),
  use: {
    baseURL: 'http://127.0.0.1:4322/shoal-app/',
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(process.env.SHOAL_CHROMIUM_EXECUTABLE
      ? { launchOptions: { executablePath: process.env.SHOAL_CHROMIUM_EXECUTABLE } }
      : {}),
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4322 --ignore-lock',
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    url: 'http://127.0.0.1:4322/shoal-app/join/',
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      PUBLIC_SHOAL_JOIN_SERVICE_URL: 'https://join.example',
      SHOAL_PUBLIC_CONTENT_FETCH: 'skip',
      SHOAL_PROJECTION_FILE: 'src/guide/services/directory/fixtures/network.json',
    },
  },
});
