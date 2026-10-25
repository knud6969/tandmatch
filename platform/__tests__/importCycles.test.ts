// Sikrer, at der ikke opstår importcykler mellem modulerne (docs/architecture.md 2.1). Domænerne må gerne bruge hinanden
// via index.ts, men en cykel gennem barrels kan give udefinerede klasser ved opstart. Type-imports tæller ikke med.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");
const EXT = ["", ".ts", ".tsx", "/index.ts"];
const RUNTIME_IMPORT = /^(?:import|export)\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm;

function sourceFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "app", "features", "platform", "components", "lib"], { cwd: ROOT, encoding: "utf8" });
  // Filer, der er slettet, men endnu ikke committet, springes over.
  return out.split("\n").filter((f) => /\.tsx?$/.test(f) && !f.includes("__tests__") && existsSync(path.join(ROOT, f)));
}

function importGraph(files: string[]): Map<string, string[]> {
  const known = new Set(files);
  const resolve = (from: string, spec: string): string | null => {
    let base: string;
    if (spec.startsWith("@/")) base = spec.slice(2);
    else if (spec.startsWith(".")) base = path.join(path.dirname(from), spec);
    else return null;
    for (const ext of EXT) if (known.has(base + ext)) return base + ext;
    return null;
  };
  const graph = new Map<string, string[]>();
  for (const file of files) {
    const src = readFileSync(path.join(ROOT, file), "utf8");
    const deps: string[] = [];
    for (const m of src.matchAll(RUNTIME_IMPORT)) {
      const target = resolve(file, m[1]);
      if (target) deps.push(target);
    }
    graph.set(file, deps);
  }
  return graph;
}

// Tarjans algoritme: stærkt forbundne komponenter med mere end én fil er cykler.
function cycles(graph: Map<string, string[]>): string[][] {
  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const found: string[][] = [];
  const visit = (v: string) => {
    index.set(v, counter);
    low.set(v, counter++);
    stack.push(v);
    onStack.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!));
    }
    if (low.get(v) === index.get(v)) {
      const component: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      if (component.length > 1) found.push(component);
    }
  };
  for (const v of graph.keys()) if (!index.has(v)) visit(v);
  return found;
}

describe("importcykler", () => {
  it("der er ingen cykler mellem modulerne", () => {
    expect(cycles(importGraph(sourceFiles()))).toEqual([]);
  });
});
