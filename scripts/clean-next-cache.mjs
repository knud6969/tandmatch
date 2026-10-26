// Rydder Next.js' udviklingscache (.next), så den ikke vokser sig stor og ender i en tilstand, hvor dev-serveren
// genindlæser siden i ring (set 2026-10-25: 4,2 GB .next fik alle e2e-tests til at hænge).
//
//   node scripts/clean-next-cache.mjs          sletter kun, hvis .next er større end NEXT_CACHE_MAX_MB (standard 1000)
//   node scripts/clean-next-cache.mjs --force  sletter altid (npm run clean)
//
// Køres automatisk før `npm run dev` (predev) og før API- og e2e-testene, der bygger i deres egen mappe
// (NEXT_DIST_DIR=.next-test, se next.config.ts). Udviklingsmappen .next slettes aldrig, mens en Next-server kører.
// Mappen er kun en cache: Next bygger den op igen ved næste start.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, lstatSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const distDir = process.env.NEXT_DIST_DIR || ".next";
const dir = resolve(import.meta.dirname, "..", distDir);
const force = process.argv.includes("--force");
const maxMb = Number(process.env.NEXT_CACHE_MAX_MB) || 1000;

function sizeBytes(path) {
  let total = 0;
  const stack = [path];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else {
        try {
          total += lstatSync(full).size;
        } catch {
          // Filen forsvandt undervejs.
        }
      }
    }
  }
  return total;
}

function nextServerRunning() {
  try {
    return execFileSync("pgrep", ["-f", "next-server|next dev"], { encoding: "utf8" }).trim().length > 0;
  } catch {
    return false; // pgrep finder intet (exit 1) eller findes ikke.
  }
}

if (!existsSync(dir)) process.exit(0);

const mb = Math.round(sizeBytes(dir) / 1024 / 1024);
if (!force && mb <= maxMb) process.exit(0);

// Testmappen bruges kun af testserveren, som runneren starter bagefter; en kørende `npm run dev` bruger .next.
if (distDir === ".next" && nextServerRunning()) {
  console.warn(`.next fylder ${mb} MB, men en Next-server kører. Stop den, og kør npm run clean.`);
  process.exit(0);
}

rmSync(dir, { recursive: true, force: true });
console.log(`Ryddede ${distDir} (${mb} MB). Første side kompileres forfra.`);
