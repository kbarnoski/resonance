import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Vitest config — node environment, points the @/ alias at src/ so
 * tests can import via the same paths the Next.js app uses.
 *
 * Tests live in src/lib/**\/*.test.ts. We deliberately scope to lib/
 * for now — testing React components needs jsdom + RTL and can come
 * later as a separate sweep.
 */
export default defineConfig({
  // Disable PostCSS — these tests are pure Node and don't load any
  // CSS, but Vite picks up the project's tailwind PostCSS config and
  // crashes parsing it.
  css: { postcss: { plugins: [] } },
  test: {
    environment: "node",
    globals: false,
    include: ["src/lib/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
