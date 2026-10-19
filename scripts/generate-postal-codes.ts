// Genererer alle danske postnumre til TandMatch (architecture 2.2, 4.3, 11).
// Kun til udvikling: køres manuelt, aldrig fra appen, seed eller tests, og laver ingen netværkskald.
//
// Kilde: GeoNames' postnummerfil for Danmark, https://download.geonames.org/export/zip/DK.zip (CC BY 4.0).
// Hent og pak filen ud manuelt, og kør derefter:
//   node --experimental-default-type=module scripts/generate-postal-codes.ts <sti til DK.txt> [hentedato ÅÅÅÅ-MM-DD]
//
// Skriver supabase/data/postal-codes.csv og supabase/migrations/20261028000400_postal_codes_dk.sql.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type PostalRow = { postalCode: string; city: string; lat: number; lng: number };

const SOURCE_URL = 'https://download.geonames.org/export/zip/DK.zip';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CSV_PATH = resolve(root, 'supabase/data/postal-codes.csv');
const MIGRATION_PATH = resolve(root, 'supabase/migrations/20261028000400_postal_codes_dk.sql');

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function parse(text: string): PostalRow[] {
  const byCode = new Map<string, PostalRow>();
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    const postalCode = (cols[1] ?? '').trim();
    const city = (cols[2] ?? '').trim();
    const lat = Number.parseFloat((cols[9] ?? '').trim());
    const lng = Number.parseFloat((cols[10] ?? '').trim());
    if (!/^\d{4}$/.test(postalCode)) throw new Error(`Linje ${index + 1}: ugyldigt postnummer "${postalCode}"`);
    if (!city) throw new Error(`Linje ${index + 1}: by mangler for ${postalCode}`);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error(`Linje ${index + 1}: koordinater mangler for ${postalCode}`);
    // Koder under 1000 er special- og udlandskoder (fx 0900, 0960 Udland) med misvisende koordinater.
    if (Number(postalCode) < 1000) continue;
    if (byCode.has(postalCode)) throw new Error(`Linje ${index + 1}: postnummer ${postalCode} findes to gange`);
    byCode.set(postalCode, { postalCode, city, lat: round4(lat), lng: round4(lng) });
  }
  return [...byCode.values()].sort((a, b) => a.postalCode.localeCompare(b.postalCode));
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function main(): void {
  const input = process.argv[2];
  if (!input) throw new Error('Brug: node --experimental-default-type=module scripts/generate-postal-codes.ts <sti til DK.txt> [hentedato]');
  const fetchedOn = process.argv[3] ?? new Date().toISOString().slice(0, 10);
  const rows = parse(readFileSync(resolve(input), 'utf8'));
  if (rows.length === 0) throw new Error('Ingen rækker i filen');

  const csv = ['postal_code,city,lat,lng', ...rows.map((r) => `${r.postalCode},${csvField(r.city)},${r.lat},${r.lng}`)].join('\n') + '\n';

  const values = rows.map((r) => `  (${sqlString(r.postalCode)}, ${sqlString(r.city)}, ${r.lat}, ${r.lng})`).join(',\n');
  const sql = `-- Alle danske postnumre med by og koordinater (architecture 4.3).
-- Genereret af scripts/generate-postal-codes.ts, ret ikke i hånden. Samme data ligger i supabase/data/postal-codes.csv.
-- Kilde: GeoNames, ${SOURCE_URL}
-- Hentet: ${fetchedOn}
-- Licens: Creative Commons Attribution 4.0 (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/
-- Kildeangivelse: Postnumre og koordinater: GeoNames (https://www.geonames.org), CC BY 4.0.
-- Kun data, ingen skema-, RLS- eller grant-ændringer. Idempotent: kan køres flere gange.
-- Klinikkernes egne lat/lng ændres ikke.

insert into public.postal_codes (postal_code, city, lat, lng) values
${values}
on conflict (postal_code) do update set city = excluded.city, lat = excluded.lat, lng = excluded.lng;
`;

  mkdirSync(dirname(CSV_PATH), { recursive: true });
  writeFileSync(CSV_PATH, csv);
  writeFileSync(MIGRATION_PATH, sql);
  console.log(`Skrev ${rows.length} postnumre til ${CSV_PATH} og ${MIGRATION_PATH}`);
}

main();
