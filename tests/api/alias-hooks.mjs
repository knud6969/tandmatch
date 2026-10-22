// Node-resolver til API-tests (node --test kender ikke tsconfigs "@/"-alias). Bruges kun af tests, der importerer rene
// funktioner fra lib/ (fx features/cases/__tests__/api/case-flow-journey.test.ts). Registreres i testen med register().
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const ROOT = process.cwd();

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = join(ROOT, specifier.slice(2));
    for (const candidate of [base, `${base}.ts`, join(base, "index.ts")]) {
      if (/\.ts$/.test(candidate) && existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
    }
  }
  return nextResolve(specifier, context);
}
