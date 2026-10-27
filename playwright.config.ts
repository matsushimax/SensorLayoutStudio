import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  // Software WebGL on hosted runners is slower than a local GPU.
  timeout: process.env.CI ? 120000 : 45000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:1420',
    viewport: { width: 1440, height: 960 },
    headless: true,
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-webgl'] },
  },
  webServer: {
    command: 'npm run dev',
    env: { SENSOR_LAYOUT_E2E: '1' },
    url: 'http://127.0.0.1:1420',
    reuseExistingServer: !process.env.CI,
  },
});
