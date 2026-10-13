import path from "node:path";
import { defineConfig } from "vitest/config";

// Kun enhedstests i tests/unit. tests/api, tests/rls og tests/e2e har egne kørsler.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    exclude: ["tests/api/**", "tests/rls/**", "tests/e2e/**", "node_modules/**"],
    environment: "node",
  },
});
