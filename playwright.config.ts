import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 180000,
    env: { ALLOW_TEST_SEED: 'true' },
  },
  use: { baseURL: 'http://localhost:3000' },
});
