import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"), "convex/react": path.resolve(__dirname, "./src/stories/convex-mock.tsx")
    }
  },
  test: {
    projects: [{
      extends: true,
      test: {
        name: 'node',
        // Projects run one after the other (groupOrder), not on the same cores:
        // run together, 8 cores serve ~8 jsdom workers plus Chromium and the
        // 5 s limit fails 3-10 tests per run (measured 2026-11-18). Alone: node 105 s,
        // 0 failures, slowest test 4.7 s; storybook 48 s. Sequential ~153 s vs 140-197 s together.
        sequence: { groupOrder: 1 },
        // Limit 15 s: slowest node test alone 3.4 s (AutoStateTab.trip rebase, a cold first render),
        // 4.7 s in a full node run under outside load ~20, so the old 5 s default sat at the edge.
        // 15 s is about 4x the isolated worst. Real hangs still fail, 15 s later at most.
        testTimeout: 15_000,
        environment: "jsdom",
        globals: true,
        setupFiles: ["./src/test/setup.ts"],
        exclude: ["**/.claude/**", "**/node_modules/**"]
      }
    }, {
      extends: true,
      plugins: [
        tailwindcss(),
        // The plugin will run tests for the stories defined in your Storybook config
        // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
        storybookTest({
          configDir: path.join(dirname, '.storybook')
        })
      ],
      test: {
        name: 'storybook',
        sequence: { groupOrder: 2 },
        browser: {
          enabled: true,
          headless: true,
          provider: playwright({}),
          instances: [{
            browser: 'chromium'
          }]
        }
      }
    }]
  }
});
