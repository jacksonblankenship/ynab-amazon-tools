// Tests only. Kept apart from vite.config.ts so the userscript plugin, and the build it
// produces, never see test settings.
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Source imports GM_* from "$"; tests get an in-memory stand-in they can inspect.
    // "/" means the project root here, as in Vite.
    alias: { $: "/test/gm.ts" },
  },
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // jsdom over happy-dom: its spec-compliant HTML parser (parse5) handles messy real-world Amazon/YNAB page fixtures the way browsers do.
    environment: "jsdom",
    environmentOptions: { jsdom: { url: "https://www.amazon.com/" } },
    setupFiles: ["test/setup.ts"],
    // The script's own styles as text, so tests can check them; other CSS stays empty.
    css: { include: [/(style|suite)\.css/] },
  },
});
