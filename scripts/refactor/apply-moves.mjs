// Flytter filer efter scripts/refactor/moves.json og omskriver alle importer, der peger på dem (docs/oprydning-features.md, trin 3).
// Kun til udvikling: køres manuelt, én gruppe ad gangen: node scripts/refactor/apply-moves.mjs <gruppe> [--dry-run]
// moves.json har formen { "<gruppe>": { "<gammel sti>": "<ny sti>", ... }, ... }. Logik i filerne ændres ikke, kun stier.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";

const [group, flag] = process.argv.slice(2);
const dryRun = flag === "--dry-run";
const all = JSON.parse(readFileSync("scripts/refactor/moves.json", "utf8"));
if (!group || !all[group]) {
  console.error(`Ukendt gruppe. Vælg en af: ${Object.keys(all).join(", ")}`);
  process.exit(1);
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
const tracked = () => git("ls-files").trim().split("\n");
const EXT = [".ts", ".tsx", ".js", ".mjs", ".cjs"];
const stripExt = (p) => p.replace(/\.(tsx?|m?js|cjs)$/, "");

// Mapper (gammel sti uden filtype) -> (ny sti uden filtype), og fuld sti -> fuld sti.
const moves = Object.entries(all[group]);
const byModule = new Map(moves.map(([from, to]) => [stripExt(from), stripExt(to)]));
const newToOld = new Map(moves.map(([from, to]) => [to, from]));

for (const [from] of moves) if (!existsSync(from)) throw new Error(`Findes ikke: ${from}`);

// 1) git mv
for (const [from, to] of moves) {
  if (dryRun) continue;
  mkdirSync(dirname(to), { recursive: true });
  git("mv", from, to);
}

// Finder modulets sti i det GAMLE træ (før flytningen i denne gruppe), så specifikatoren kan oversættes.
const oldFiles = new Set(dryRun ? tracked() : tracked().map((f) => newToOld.get(f) ?? f));
function resolveOld(fromOldFile, spec) {
  let base;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) base = normalize(join(dirname(fromOldFile), spec));
  else return null;
  if (oldFiles.has(base)) return { file: base, keepExt: true };
  for (const e of EXT) if (oldFiles.has(base + e)) return { file: base + e, keepExt: false };
  for (const e of EXT) if (oldFiles.has(`${base}/index${e}`)) return { file: `${base}/index${e}`, keepExt: false, index: true };
  return null;
}

// Specifikatorer i import/export, import(), require(), vi.mock()/jest.mock().
const SPEC = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*|\b(?:vi|jest)\.mock\s*\(\s*)(["'])([^"'\n]+)\2/g;
const TEXT = /\.(tsx?|m?js|cjs)$/;

let changedFiles = 0;
let changedSpecs = 0;
for (const file of tracked()) {
  if (!TEXT.test(file) || file.startsWith("scripts/refactor/")) continue;
  const oldFile = dryRun ? file : (newToOld.get(file) ?? file);
  const src = readFileSync(file, "utf8");
  // Filer i mobile/ bruger "@/" kun for rodens lib/ (mobile/tsconfig.json), og "~/" for appens egne filer.
  const out = src.replace(SPEC, (whole, pre, q, spec) => {
    const hit = resolveOld(oldFile, spec);
    if (!hit) return whole;
    const target = stripExt(hit.file);
    const movedTarget = byModule.get(target);
    const fileMoved = oldFile !== file;
    if (!movedTarget && !fileMoved) return whole;
    const newTargetFile = movedTarget ? moves.find(([f]) => stripExt(f) === target)[1] : hit.file;
    let next;
    if (spec.startsWith("@/")) {
      next = "@/" + (hit.keepExt ? newTargetFile : stripExt(newTargetFile).replace(/\/index$/, hit.index ? "" : "/index"));
      if (hit.index) next = "@/" + dirname(newTargetFile);
    } else {
      let rel = relative(dirname(file), hit.keepExt ? newTargetFile : stripExt(newTargetFile));
      if (hit.index) rel = relative(dirname(file), dirname(newTargetFile));
      next = rel.startsWith(".") ? rel : `./${rel}`;
    }
    if (next === spec) return whole;
    changedSpecs++;
    return `${pre}${q}${next}${q}`;
  });
  if (out !== src) {
    changedFiles++;
    if (!dryRun) writeFileSync(file, out);
  }
}

console.log(`${group}: ${moves.length} filer flyttet, ${changedSpecs} importer i ${changedFiles} filer omskrevet${dryRun ? " (dry-run)" : ""}.`);
