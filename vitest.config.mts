import path from "node:path";
import { defineConfig } from "vitest/config";

// Enhedstests i tests/unit og AI-tests i tests/ai (falsk klient, ingen OpenAI-kald). tests/api, tests/rls og tests/e2e har egne kørsler.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/ai/**/*.test.ts"],
    exclude: ["tests/api/**", "tests/rls/**", "tests/e2e/**", "node_modules/**"],
    environment: "node",
  },
});
