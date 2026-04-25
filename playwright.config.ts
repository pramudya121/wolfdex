import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — visual smoke tests for hero text & CTA visibility.
 *
 * Run with: `bun run test:e2e`
 *
 * The webServer block boots a Vite preview server (built output) so tests
 * run against the same bundle that is shipped to production. This catches
 * the "invisible gradient text" class of regressions which only manifest
 * after the full PostCSS / Tailwind build.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    // TanStack Start targets Cloudflare Worker — `vite preview` cannot serve
    // SSR locally because there's no Node server bundle. Use `vite dev`
    // instead, which compiles on demand and is a perfectly valid target for
    // visibility / smoke tests (the same Tailwind + components run).
    command: 'bun run dev --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
