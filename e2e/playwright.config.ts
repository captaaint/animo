import { defineConfig, devices } from '@playwright/test';
import * as path from 'node:path';
import { API_URL, STORAGE_STATE, WEB_URL } from './constants';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: STORAGE_STATE,
      },
      dependencies: ['setup'],
    },
  ],

  webServer: [
    {
      command: 'cargo run',
      cwd: path.join(__dirname, '..', 'api'),
      url: `${API_URL}/auth/me`,
      reuseExistingServer: !isCI,
      // Cold cargo build can take a few minutes on a fresh checkout.
      timeout: 5 * 60 * 1000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run start',
      cwd: path.join(__dirname, '..', 'web'),
      url: WEB_URL,
      reuseExistingServer: !isCI,
      timeout: 2 * 60 * 1000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
