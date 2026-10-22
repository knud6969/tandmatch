import path from "node:path";
import { defineConfig } from "vitest/config";

// Enhedstests og AI-tests i features/<domæne>/__tests__ og platform/__tests__ (falsk klient, ingen OpenAI-kald).
// API-testene i __tests__/api samt tests/rls og tests/e2e har egne kørsler.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    include: ["features/**/__tests__/**/*.test.ts", "platform/__tests__/**/*.test.ts"],
    exclude: ["**/__tests__/api/**", "tests/**", "mobile/**", "node_modules/**"],
    environment: "node",
  },
});
