import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = 3317;
const WEB_PORT = 5173;

export default defineConfig({
  testDir: '../../apps/web/e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: '../../test-evidence/e2e-results',
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm exec tsx src/index.ts',
      cwd: __dirname,
      url: `http://127.0.0.1:${PORT}/api/health`,
      reuseExistingServer: true,
      timeout: 60_000,
      env: {
        PORT: String(PORT),
        NODE_ENV: 'development',
        LLM_MODE: 'deterministic',
        ADMIN_TOKEN: 'e2e-admin-token-000001',
        APP_SECRET: 'e2e-secret-with-more-than-24-chars-000',
        PUBLIC_ORIGIN: `http://127.0.0.1:${WEB_PORT}`,
        ENCRYPTION_KEY: '',
        DATABASE_PATH: '/tmp/2027-e2e.sqlite',
      } as Record<string, string>,
    },
    {
      command: 'pnpm exec vite --port 5173 --host 127.0.0.1',
      cwd: '../../apps/web',
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: true,
      timeout: 60_000,
      env: { VITE_API_TARGET: `http://127.0.0.1:${PORT}` } as Record<string, string>,
    },
  ],
});
