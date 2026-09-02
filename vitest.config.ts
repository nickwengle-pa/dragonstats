import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest runs the `.spec.ts` files only.
 *
 * The older `.test.ts` files are standalone scripts — plain node, top-level
 * assertions, `process.exitCode` — and vitest reports a file containing no
 * `it()` as a failure. Splitting by extension lets both kinds run without
 * rewriting five working suites just to change how they are invoked.
 *
 * Specs exist for what needs a bundler: anything importing the vendored stats
 * engine, whose dist uses extensionless imports that only Vite can resolve.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    include: ["src/**/*.spec.ts"],
  },
});
