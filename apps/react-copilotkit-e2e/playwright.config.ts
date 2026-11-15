import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { getReadyUrl, workspaceRoot } from '@nx/devkit';

const isCI = !!process.env['CI'];
// Dev server on 4201, preview build on 4301 (see apps/react-copilotkit/vite.config.ts).
const webServerAddress = getReadyUrl(
  isCI ? 'http://localhost:4301' : 'http://localhost:4201',
);
const baseURL = process.env['BASE_URL'] || webServerAddress;

/**
 * See https://playwright.dev/docs/test-configuration.
 * The workspace is `"type": "module"`, so this `.ts` config loads as ESM.
 */
export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './src' }),
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: isCI
      ? 'pnpm exec nx run react-copilotkit:preview'
      : 'pnpm exec nx run react-copilotkit:dev',
    url: webServerAddress,
    reuseExistingServer: true,
    cwd: workspaceRoot,
  },
  // Chromium only: the Prompt API and WebGPU features we target are Chromium-based.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
