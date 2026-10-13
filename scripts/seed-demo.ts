// Demo-seed for TandMatch (architecture 2.3, 4, 11). KUN fiktive data og genererede pladsholderbilleder.
//
// Kører mod den LOKALE Supabase (`supabase start` + `supabase db reset`, som også indlæser supabase/seed.sql).
// Miljø (aldrig .env.local): npm run seed:demo bruger .env.test.local med
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (fra `supabase status`).
// Scriptet nægter at køre mod en ikke-lokal URL, medmindre --allow-remote gives.
//
// Alt oprettes gennem de rigtige veje, så reglerne i databasen gælder: brugere via signup-triggeren, sager,
// samtykker, leads, beslutninger og bookinger via patientens og klinikkens egne sessioner (RLS og funktioner).
// Kun forhistorik (afsluttede bookinger, udeblivelse, godkendte anmeldelser) og referencedata skrives med
// service role. Demo-brugere har e-mail @demo.tandmatch.test; demo-klinikker har import_source = 'seed'.
// Scriptet rydder først eventuelle tidligere demodata og er dermed genkørbart.
// Adgangskoden til demo-brugerne er tilfældig pr. kørsel og vises kun i terminalen.

import { randomBytes, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const DEMO_EMAIL_SUFFIX = '@demo.tandmatch.test';
export const SEED_SOURCE = 'seed';

export type Config = { url: string; anonKey: string; serviceKey: string };

// ---------------------------------------------------------------------------------------------------------
// Miljø og klienter
// ---------------------------------------------------------------------------------------------------------

function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === '127.0.0.1' || host === 'localhost' || host === '0.0.0.0' || host === '[::1]' || host === '::1';
  } catch {
    return false;
  }
}

export function readConfig(argv: string[]): Config {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    throw new Error(
      'Mangler NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY eller SUPABASE_SERVICE_ROLE_KEY. ' +
        'Kør via npm-scriptet (bruger .env.test.local) eller sæt dem fra `supabase status`.',
    );
  }
  if (!isLocalUrl(url) && !argv.includes('--allow-remote')) {
    throw new Error(
      'URL\'en er ikke lokal. Scriptet kører kun mod lokal Supabase, medmindre --allow-remote gives udtrykkeligt.',
    );
  }
  return { url, anonKey, serviceKey };
}

function newClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export function createAdmin(config: Config): SupabaseClient {
  return newClient(config.url, config.serviceKey);
}

type DbResult<T> = { data: T | null; error: { message: string } | null };

function must<T>(result: DbResult<T>, context: string): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${context}: tomt svar`);
  return result.data;
}

function mustOk(result: { error: { message: string } | null }, context: string): void {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
}

// ---------------------------------------------------------------------------------------------------------
// Oprydning (bruges også af unseed-demo.ts)
// ---------------------------------------------------------------------------------------------------------

async function listDemoUsers(admin: SupabaseClient): Promise<{ id: string; email: string }[]> {
  const found: { id: string; email: string }[] = [];
  const perPage = 200;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers fejlede: ${error.message}`);
    for (const user of data.users) {
      if (user.email && user.email.toLowerCase().endsWith(DEMO_EMAIL_SUFFIX)) {
        found.push({ id: user.id, email: user.email });
      }
    }
    if (data.users.length < perPage) break;
  }
  return found;
}

async function removePrefix(admin: SupabaseClient, bucket: string, prefix: string): Promise<number> {
  const paths: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await admin.storage.from(bucket).list(dir, { limit: 100, offset });
      if (error) throw new Error(`storage list ${bucket}/${dir}: ${error.message}`);
      const entries = data ?? [];
      for (const entry of entries) {
        const path = `${dir}/${entry.name}`;
        if (entry.id === null) await walk(path);
        else paths.push(path);
      }
      if (entries.length < 100) break;
    }
  };
  await walk(prefix);
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
    if (error) throw new Error(`storage remove ${bucket}: ${error.message}`);
  }
  return paths.length;
}

export type CleanupSummary = { users: number; clinics: number; files: number };

// Sletter alle demodata. Rækkefølge: patientbrugere (cascade: sager, leads, bookinger, anmeldelser), klinikker,
// klinikbrugere. Rækker uden for demoen røres ikke.
export async function cleanupDemo(admin: SupabaseClient, dryRun: boolean): Promise<CleanupSummary> {
  const users = await listDemoUsers(admin);
  const userIds = users.map((u) => u.id);
  const summary: CleanupSummary = { users: users.length, clinics: 0, files: 0 };

  const profiles = userIds.length
    ? must(await admin.from('profiles').select('id, role').in('id', userIds), 'profiles')
    : [];
  const patientIds = (profiles as { id: string; role: string }[]).filter((p) => p.role === 'patient').map((p) => p.id);
  const clinicUserIds = (profiles as { id: string; role: string }[]).filter((p) => p.role === 'clinic').map((p) => p.id);

  const clinicRows = must(
    await admin.from('clinics').select('id, owner_id').or(
      clinicUserIds.length ? `import_source.eq.${SEED_SOURCE},owner_id.in.(${clinicUserIds.join(',')})` : `import_source.eq.${SEED_SOURCE}`,
    ),
    'clinics',
  ) as { id: string; owner_id: string | null }[];
  summary.clinics = clinicRows.length;

  const caseRows = patientIds.length
    ? (must(await admin.from('cases').select('id').in('patient_id', patientIds), 'cases') as { id: string }[])
    : [];

  if (dryRun) {
    summary.files = -1;
    return summary;
  }

  for (const c of caseRows) summary.files += await removePrefix(admin, 'case-images', c.id);
  for (const c of clinicRows) summary.files += await removePrefix(admin, 'public-media', `clinics/${c.id}`);

  for (const id of patientIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new Error(`deleteUser (patient): ${error.message}`);
  }
  if (clinicRows.length) {
    mustOk(await admin.from('clinics').delete().in('id', clinicRows.map((c) => c.id)), 'delete clinics');
  }
  for (const id of clinicUserIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new Error(`deleteUser (klinik): ${error.message}`);
  }
  // Brugere uden profil (fx halvt oprettede) ryddes også.
  const remaining = await listDemoUsers(admin);
  for (const u of remaining) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) throw new Error(`deleteUser: ${error.message}`);
  }
  return summary;
}

// ---------------------------------------------------------------------------------------------------------
// Tid (Europe/Copenhagen)
// ---------------------------------------------------------------------------------------------------------

const TZ = 'Europe/Copenhagen';

type Ymd = { y: number; m: number; d: number };

function copenhagenOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - at.getTime()) / 60000);
}

// Lokal tid i København -> UTC-tidspunkt.
function localToUtc(day: Ymd, hour: number, minute: number): Date {
  const guess = new Date(Date.UTC(day.y, day.m - 1, day.d, hour, minute));
  let result = new Date(guess.getTime() - copenhagenOffsetMinutes(guess) * 60000);
  result = new Date(guess.getTime() - copenhagenOffsetMinutes(result) * 60000);
  return result;
}

function todayLocal(): Ymd {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

function addDays(day: Ymd, n: number): Ymd {
  const date = new Date(Date.UTC(day.y, day.m - 1, day.d + n));
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

function isoWeekday(day: Ymd): number {
  const w = new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay();
  return w === 0 ? 7 : w;
}

// Første hverdag (man-fre) mindst `minDays` dage frem.
function nextWeekday(minDays: number): Ymd {
  let day = addDays(todayLocal(), minDays);
  while (isoWeekday(day) > 5) day = addDays(day, 1);
  return day;
}

function plusMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

// ---------------------------------------------------------------------------------------------------------
// Pladsholderbilleder (genereret, ingen rigtige personer eller fotos)
// ---------------------------------------------------------------------------------------------------------

type Placeholder = { buffer: Buffer; width: number; height: number };

async function placeholderJpeg(label: string, hue: number, width = 800, height = 600): Promise<Placeholder> {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue},70%,86%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},60%,68%)"/>` +
    `</linearGradient></defs>` +
    `<rect width="100%" height="100%" fill="url(#g)"/>` +
    `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 4}" ry="${height / 6}" fill="white" fill-opacity="0.75"/>` +
    `<text x="50%" y="${height - 36}" font-size="28" text-anchor="middle" fill="#123" font-family="sans-serif">${label}</text>` +
    `</svg>`;
  const buffer = await sharp(Buffer.from(svg)).jpeg({ quality: 78 }).toBuffer();
  return { buffer, width, height };
}

async function uploadJpeg(admin: SupabaseClient, bucket: string, path: string, image: Placeholder): Promise<void> {
  const { error } = await admin.storage.from(bucket).upload(path, image.buffer, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`upload ${bucket}/${path}: ${error.message}`);
}

// ---------------------------------------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------------------------------------

type PriceBase = { slug: string; min: number; max: number };

// Listepriser (fiktive). Hver klinik ganger med en faktor.
const PRICE_BASE: PriceBase[] = [
  { slug: 'undersoegelse', min: 395, max: 595 },
  { slug: 'tandrensning', min: 495, max: 795 },
  { slug: 'fyldning', min: 695, max: 1295 },
  { slug: 'roentgen', min: 195, max: 395 },
  { slug: 'rodbehandling', min: 2495, max: 4495 },
  { slug: 'krone', min: 4995, max: 7995 },
  { slug: 'tandudtraekning', min: 795, max: 1795 },
  { slug: 'blegning', min: 1995, max: 3495 },
  { slug: 'facing', min: 3995, max: 6995 },
  { slug: 'diastema', min: 1495, max: 3495 },
  { slug: 'retainer', min: 995, max: 1795 },
  { slug: 'tandregulering_konsultation', min: 295, max: 595 },
  { slug: 'akut_konsultation', min: 695, max: 1195 },
  { slug: 'akut_smertebehandling', min: 995, max: 1895 },
];

// Fiktive kontaktdata: telefonnumre er på formen +45 00 00 xx xx (danske numre starter aldrig med 0), og CVR-numrene
// består IKKE modulus 11-kontrollen, så de aldrig kan svare til en rigtig virksomhed.
type ImportedSpec = {
  cvr: string; name: string; address: string; postalCode: string; city: string; phone: string; website: string;
  trustpilot?: { url: string; score: number; count: number };
  weekdayHours: boolean;
};

const IMPORTED: ImportedSpec[] = [
  { cvr: '90000001', name: 'Demo Tandlæge Frederiksberg', address: 'Eksempelvej 1', postalCode: '2000', city: 'Frederiksberg', phone: '+45 00 00 00 01', website: 'https://example.com/demo-1',
    trustpilot: { url: 'https://dk.trustpilot.com/review/demo-eksempel-1.dk', score: 4.4, count: 87 }, weekdayHours: true },
  { cvr: '90000002', name: 'Demo Tandklinik Esbjerg', address: 'Prøvegade 2', postalCode: '6700', city: 'Esbjerg', phone: '+45 00 00 00 02', website: 'https://example.com/demo-2',
    trustpilot: { url: 'https://dk.trustpilot.com/review/demo-eksempel-2.dk', score: 3.8, count: 23 }, weekdayHours: true },
  { cvr: '90000003', name: 'Demo Tandlægehuset Vejle', address: 'Testallé 3', postalCode: '7100', city: 'Vejle', phone: '+45 00 00 00 03', website: 'https://example.com/demo-3',
    trustpilot: { url: 'https://www.trustpilot.com/review/demo-eksempel-3.dk', score: 4.7, count: 152 }, weekdayHours: false },
  { cvr: '90000007', name: 'Demo Tandcenter Helsingør', address: 'Fiktivstræde 4', postalCode: '3000', city: 'Helsingør', phone: '+45 00 00 00 04', website: 'https://example.com/demo-4', weekdayHours: true },
  { cvr: '90000005', name: 'Demo Tandklinikken Valby', address: 'Modelvej 5', postalCode: '2500', city: 'Valby', phone: '+45 00 00 00 05', website: 'https://example.com/demo-5', weekdayHours: false },
  { cvr: '90000006', name: 'Demo Tandlæge Lyngby', address: 'Skabelonvej 6', postalCode: '2800', city: 'Kongens Lyngby', phone: '+45 00 00 00 06', website: 'https://example.com/demo-6', weekdayHours: true },
];

type VerifiedSpec = {
  key: string; cvr: string; name: string; address: string; postalCode: string; city: string; phone: string; email: string;
  description: string; factor: number; saturday: boolean; emergencyWindow: boolean; hue: number;
  trustpilot?: { url: string; score: number; count: number };
  dentists: { name: string; title: string; bio: string }[];
};

const VERIFIED: VerifiedSpec[] = [
  { key: 'v0', cvr: '90001001', name: 'Demo Tandklinik Nørrebro', address: 'Demovej 10', postalCode: '2200', city: 'København N', phone: '+45 00 00 10 01',
    email: 'klinik-v0@demo.tandmatch.test', description: 'Fiktiv demoklinik i København med fokus på kosmetisk tandpleje og akuttider.', factor: 1.15, saturday: false, emergencyWindow: true, hue: 200,
    trustpilot: { url: 'https://dk.trustpilot.com/review/demo-eksempel-v0.dk', score: 4.5, count: 120 },
    dentists: [
      { name: 'Anne Demosen', title: 'Tandlæge', bio: 'Fiktiv tandlæge. Arbejder med kosmetiske behandlinger.' },
      { name: 'Rasmus Eksempel', title: 'Specialtandlæge i ortodonti', bio: 'Fiktiv specialtandlæge til demoformål.' },
    ] },
  { key: 'v1', cvr: '90001002', name: 'Demo Tandlægerne Aarhus', address: 'Prøveplads 20', postalCode: '8000', city: 'Aarhus C', phone: '+45 00 00 10 02',
    email: 'klinik-v1@demo.tandmatch.test', description: 'Fiktiv demoklinik i Aarhus med almindelig og kosmetisk tandpleje.', factor: 1.0, saturday: false, emergencyWindow: true, hue: 150,
    trustpilot: { url: 'https://dk.trustpilot.com/review/demo-eksempel-v1.dk', score: 4.2, count: 64 },
    dentists: [
      { name: 'Camilla Testesen', title: 'Tandlæge', bio: 'Fiktiv tandlæge til demoformål.' },
      { name: 'Mikkel Fiktiv', title: 'Tandlæge', bio: 'Fiktiv tandlæge til demoformål.' },
    ] },
  { key: 'v2', cvr: '90001003', name: 'Demo Tandcenter Odense', address: 'Skitsegade 30', postalCode: '5000', city: 'Odense C', phone: '+45 00 00 10 03',
    email: 'klinik-v2@demo.tandmatch.test', description: 'Fiktiv demoklinik i Odense med åbent om lørdagen.', factor: 0.9, saturday: true, emergencyWindow: false, hue: 30,
    dentists: [
      { name: 'Louise Prøvesen', title: 'Tandlæge', bio: 'Fiktiv tandlæge til demoformål.' },
      { name: 'Jens Modelsen', title: 'Tandlæge', bio: 'Fiktiv tandlæge til demoformål.' },
    ] },
  { key: 'v3', cvr: '90001004', name: 'Demo Tandklinik Aalborg', address: 'Mockupvej 40', postalCode: '9000', city: 'Aalborg', phone: '+45 00 00 10 04',
    email: 'klinik-v3@demo.tandmatch.test', description: 'Fiktiv demoklinik i Aalborg.', factor: 0.95, saturday: false, emergencyWindow: false, hue: 300,
    trustpilot: { url: 'https://dk.trustpilot.com/review/demo-eksempel-v3.dk', score: 3.9, count: 31 },
    dentists: [
      { name: 'Sara Skabelon', title: 'Tandlæge', bio: 'Fiktiv tandlæge til demoformål.' },
      { name: 'Peter Pladsholder', title: 'Tandlæge', bio: 'Fiktiv tandlæge til demoformål.' },
    ] },
];

const REGISTERED = {
  cvr: '90002001', name: 'Demo Tandlægehuset Roskilde', address: 'Kladdevej 50', postalCode: '4000', city: 'Roskilde', phone: '+45 00 00 20 01',
  email: 'klinik-registreret@demo.tandmatch.test',
};

const PATIENTS = [
  { firstName: 'Mette', postalCode: '2200', phone: '+45 00 00 20 01', fullName: 'Mette Eksempel' },
  { firstName: 'Jonas', postalCode: '8000', phone: '+45 00 00 20 02', fullName: 'Jonas Demo' },
  { firstName: 'Sofie', postalCode: '5000', phone: '+45 00 00 20 03', fullName: 'Sofie Testesen' },
  { firstName: 'Emil', postalCode: '2100', phone: '+45 00 00 20 04', fullName: 'Emil Fiktiv' },
  { firstName: 'Laura', postalCode: '9000', phone: '+45 00 00 20 05', fullName: 'Laura Prøve' },
];

const REVIEW_TEXTS = [
  'Venlig modtagelse og en grundig forklaring af behandlingen. Alt gik som aftalt.',
  'God oplevelse fra start til slut, og tandlægen tog sig god tid til mine spørgsmål.',
  'Prisen blev gennemgået inden behandlingen, men regningen endte lidt over overslaget.',
  'Professionelt personale og rene lokaler. Jeg kommer gerne igen til kontrol.',
  'Fin behandling, men jeg ville ønske, at ekstraomkostningerne var nævnt tydeligere på forhånd.',
  'Overslaget holdt ikke, og jeg følte ikke, at der var åbenhed om prisen undervejs.',
];

type ReviewPlan = { accuracy: 'as_quoted' | 'slightly_higher' | 'much_higher'; stars: number; text: number; transparency: boolean | null };
const REVIEW_PLANS: ReviewPlan[] = [
  { accuracy: 'as_quoted', stars: 5, text: 0, transparency: false },
  { accuracy: 'as_quoted', stars: 5, text: 1, transparency: false },
  { accuracy: 'slightly_higher', stars: 4, text: 2, transparency: null },
  { accuracy: 'as_quoted', stars: 4, text: 3, transparency: false },
  { accuracy: 'slightly_higher', stars: 3, text: 4, transparency: true },
  { accuracy: 'much_higher', stars: 2, text: 5, transparency: true },
  { accuracy: 'as_quoted', stars: 5, text: 0, transparency: false },
  { accuracy: 'as_quoted', stars: 4, text: 1, transparency: null },
  { accuracy: 'slightly_higher', stars: 4, text: 3, transparency: null },
];

// ---------------------------------------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------------------------------------

type ClinicHandle = { spec: VerifiedSpec; clinicId: string; userId: string; client: SupabaseClient };
type PatientHandle = { index: number; userId: string; client: SupabaseClient; email: string; consentImageId: string };

async function signIn(config: Config, email: string, password: string): Promise<SupabaseClient> {
  const client = newClient(config.url, config.anonKey);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return client;
}

async function createUser(admin: SupabaseClient, email: string, password: string, meta: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: meta });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message ?? 'ukendt fejl'}`);
  return data.user.id;
}

function log(message: string): void {
  console.log(message);
}

async function seed(config: Config): Promise<void> {
  const admin = createAdmin(config);
  const password = `Demo-${randomBytes(9).toString('base64url')}`;

  const { count: postalCount, error: postalError } = await admin.from('postal_codes').select('postal_code', { count: 'exact', head: true });
  if (postalError) throw new Error(`postal_codes: ${postalError.message}`);
  if (!postalCount) throw new Error('Postnumre mangler. Kør `supabase db reset` først (indlæser supabase/seed.sql).');

  log('Rydder tidligere demodata ...');
  const cleaned = await cleanupDemo(admin, false);
  log(`  slettet: ${cleaned.users} brugere, ${cleaned.clinics} klinikker, ${cleaned.files} filer`);

  const serviceRows = must(await admin.from('services').select('id, slug, group_id'), 'services') as { id: string; slug: string; group_id: string }[];
  const serviceId = new Map(serviceRows.map((s) => [s.slug, s.id]));
  // Kategorierne bag prislisten: klinikken skal have valgt dem, før en pris kan gemmes (clinic_prices_guard).
  const priceGroupIds = [...new Set(PRICE_BASE.map((p) => serviceRows.find((s) => s.slug === p.slug)?.group_id).filter((id): id is string => !!id))];
  const sid = (slug: string): string => {
    const id = serviceId.get(slug);
    if (!id) throw new Error(`Ydelse mangler i kataloget: ${slug}`);
    return id;
  };

  // --- Importerede klinikker (ingen konto) --------------------------------------------------------------
  log('Opretter importerede klinikker ...');
  for (const spec of IMPORTED) {
    const pc = must(await admin.from('postal_codes').select('lat, lng').eq('postal_code', spec.postalCode).single(), 'postnummer') as { lat: number; lng: number };
    const row = must(
      await admin.from('clinics').insert({
        status: 'imported', cvr: spec.cvr, name: spec.name, address: spec.address, postal_code: spec.postalCode, city: spec.city,
        lat: pc.lat, lng: pc.lng, phone: spec.phone, website: spec.website, import_source: SEED_SOURCE,
        ...(spec.trustpilot
          ? { trustpilot_url: spec.trustpilot.url, trustpilot_score: spec.trustpilot.score, trustpilot_review_count: spec.trustpilot.count, trustpilot_entered_by: 'admin' }
          : {}),
      }).select('id').single(),
      `insert ${spec.name}`,
    ) as { id: string };
    if (spec.weekdayHours) {
      mustOk(await admin.from('clinic_opening_hours').insert(
        [1, 2, 3, 4, 5].map((weekday) => ({ clinic_id: row.id, weekday, opens_at: '08:00', closes_at: '16:00', is_emergency: false })),
      ), 'åbningstider (importeret)');
    }
  }

  // --- Oprettet (registered) klinik ---------------------------------------------------------------------
  log('Opretter en oprettet klinik ...');
  await createUser(admin, REGISTERED.email, password, {
    role: 'clinic', cvr: REGISTERED.cvr, clinic_name: REGISTERED.name, address: REGISTERED.address,
    postal_code: REGISTERED.postalCode, city: REGISTERED.city, phone: REGISTERED.phone,
  });
  mustOk(await admin.from('clinics').update({ import_source: SEED_SOURCE }).eq('cvr', REGISTERED.cvr), 'markér registreret klinik');

  // --- Verificerede klinikker ---------------------------------------------------------------------------
  log('Opretter verificerede klinikker med prisliste, åbningstider, tandlæger og portefølje ...');
  const clinics: ClinicHandle[] = [];
  const blockDay = addDays(todayLocal(), 10);
  for (const spec of VERIFIED) {
    const userId = await createUser(admin, spec.email, password, {
      role: 'clinic', cvr: spec.cvr, clinic_name: spec.name, address: spec.address,
      postal_code: spec.postalCode, city: spec.city, phone: spec.phone,
    });
    const clinicId = (must(await admin.from('clinics').select('id').eq('owner_id', userId).single(), 'klinik') as { id: string }).id;

    const logo = await placeholderJpeg(`Logo ${spec.key.toUpperCase()} (fiktivt)`, spec.hue, 400, 400);
    await uploadJpeg(admin, 'public-media', `clinics/${clinicId}/logo.jpg`, logo);
    mustOk(await admin.from('clinics').update({
      import_source: SEED_SOURCE, description: spec.description, email: spec.email.replace('klinik-', 'info-'),
      website: `https://example.com/${spec.key}`, logo_path: `clinics/${clinicId}/logo.jpg`, logo_updated_at: new Date().toISOString(),
      ...(spec.trustpilot
        ? { trustpilot_url: spec.trustpilot.url, trustpilot_score: spec.trustpilot.score, trustpilot_review_count: spec.trustpilot.count, trustpilot_entered_by: 'clinic' }
        : {}),
    }).eq('id', clinicId), 'opdater klinik');

    mustOk(await admin.from('clinic_service_groups').insert(priceGroupIds.map((groupId) => ({ clinic_id: clinicId, group_id: groupId }))), 'valgte kategorier');
    mustOk(await admin.from('clinic_prices').insert(PRICE_BASE.map((p) => ({
      clinic_id: clinicId, service_id: sid(p.slug),
      price_min: Math.round((p.min * spec.factor) / 5) * 5 - 5,
      price_max: Math.round((p.max * spec.factor) / 5) * 5 - 5,
      duration_min: serviceRows.length ? defaultDuration(p.slug) : 30,
      note: p.slug === 'undersoegelse' ? 'Inkl. 2 røntgenbilleder' : null,
    }))), 'prisliste');

    const hours: Record<string, unknown>[] = [1, 2, 3, 4, 5].map((weekday) => ({ clinic_id: clinicId, weekday, opens_at: '08:00', closes_at: '16:00', is_emergency: false }));
    if (spec.saturday) hours.push({ clinic_id: clinicId, weekday: 6, opens_at: '09:00', closes_at: '13:00', is_emergency: false });
    if (spec.emergencyWindow) for (const weekday of [1, 2, 3, 4, 5]) hours.push({ clinic_id: clinicId, weekday, opens_at: '16:00', closes_at: '19:00', is_emergency: true });
    mustOk(await admin.from('clinic_opening_hours').insert(hours), 'åbningstider');

    if (spec.key === 'v1' || spec.key === 'v2') {
      mustOk(await admin.from('clinic_time_blocks').insert({
        clinic_id: clinicId, starts_at: localToUtc(blockDay, 0, 0).toISOString(), ends_at: localToUtc(addDays(blockDay, spec.key === 'v1' ? 7 : 1), 0, 0).toISOString(),
        note: spec.key === 'v1' ? 'Sommerferie (fiktiv)' : 'Kursusdag (fiktiv)',
      }), 'blokering');
    }

    const dentistIds: string[] = [];
    for (const [i, dentist] of spec.dentists.entries()) {
      const dentistId = randomUUID();
      const photoPath = `clinics/${clinicId}/dentists/${dentistId}.jpg`;
      if (i === 0) await uploadJpeg(admin, 'public-media', photoPath, await placeholderJpeg('Portræt (fiktivt)', spec.hue + 20, 400, 400));
      mustOk(await admin.from('clinic_dentists').insert({
        id: dentistId, clinic_id: clinicId, full_name: dentist.name, title: dentist.title, bio: dentist.bio,
        photo_path: i === 0 ? photoPath : null, sort_order: i,
      }), 'tandlæge');
      dentistIds.push(dentistId);
    }

    if (spec.key === 'v0' || spec.key === 'v1') {
      for (const [i, slug] of ['blegning', 'facing'].entries()) {
        const itemId = randomUUID();
        const imagePath = `clinics/${clinicId}/portfolio/${itemId}.jpg`;
        await uploadJpeg(admin, 'public-media', imagePath, await placeholderJpeg(`Eksempel: ${slug} (fiktivt billede)`, spec.hue + i * 60));
        mustOk(await admin.from('portfolio_items').insert({
          id: itemId, clinic_id: clinicId, dentist_id: dentistIds[0], service_id: sid(slug), image_path: imagePath,
          caption: 'Genereret pladsholder, ikke en rigtig patient', patient_consent_confirmed_at: new Date().toISOString(),
          consent_text_version: 'portfolio_consent@v0-prototype',
        }), 'portefølje');
      }
    }

    mustOk(await admin.rpc('admin_set_clinic_status', { p_clinic_id: clinicId, p_status: 'verified' }), 'verificér klinik');
    clinics.push({ spec, clinicId, userId, client: await signIn(config, spec.email, password) });
  }
  const [v0, v1, v2, v3] = clinics;

  // --- Patienter og samtykker ---------------------------------------------------------------------------
  log('Opretter patienter og samtykker ...');
  const patients: PatientHandle[] = [];
  for (const [index, p] of PATIENTS.entries()) {
    const email = `patient${index + 1}${DEMO_EMAIL_SUFFIX}`;
    const userId = await createUser(admin, email, password, { role: 'patient', first_name: p.firstName });
    mustOk(await admin.from('patients').update({ postal_code: p.postalCode, phone: p.phone }).eq('id', userId), 'patient');
    const consents = must(await admin.from('consents').insert([
      { patient_id: userId, type: 'ai_processing', text_version: 'ai_processing@v0-prototype' },
      { patient_id: userId, type: 'image_upload', text_version: 'image_upload@v1-ai-disclosure' },
      { patient_id: userId, type: 'health_data_sharing', text_version: 'health_data_sharing@v0-prototype' },
    ]).select('id, type'), 'samtykker') as { id: string; type: string }[];
    const imageConsent = consents.find((c) => c.type === 'image_upload');
    if (!imageConsent) throw new Error('image_upload-samtykke mangler');
    patients.push({ index, userId, client: await signIn(config, email, password), email, consentImageId: imageConsent.id });
  }
  const [p0, p1, p2, p3, p4] = patients;

  // --- Hjælpere til sagsflowet --------------------------------------------------------------------------
  type CaseInput = { patient: PatientHandle; services: string[]; summary: string; timeframe: 'asap' | 'within_2_weeks' | 'within_3_months' | 'flexible'; images?: number; emergency?: boolean };

  async function createCase(input: CaseInput, approve: boolean): Promise<string> {
    const postal = PATIENTS[input.patient.index].postalCode;
    const row = must(await input.patient.client.from('cases').insert({
      patient_id: input.patient.userId, postal_code: postal, preferred_timeframe: input.emergency ? null : input.timeframe, is_emergency: input.emergency ?? false,
    }).select('id').single(), 'opret sag') as { id: string };
    mustOk(await input.patient.client.from('case_services').insert(
      input.services.map((slug) => ({ case_id: row.id, service_id: sid(slug), suggested_by_ai: false })),
    ), 'sagens ydelser');
    for (let i = 0; i < (input.images ?? 0); i += 1) {
      const imageId = randomUUID();
      const image = await placeholderJpeg(`Pladsholder ${i + 1} (ikke et rigtigt foto)`, 40 + i * 50);
      const path = `${row.id}/${imageId}.jpg`;
      await uploadJpeg(admin, 'case-images', path, image);
      mustOk(await admin.from('case_images').insert({
        id: imageId, case_id: row.id, patient_id: input.patient.userId, consent_id: input.patient.consentImageId, storage_path: path,
        ai_view: i === 0 ? 'front' : 'upper', ai_quality: 'ok', ai_description: 'Neutral beskrivelse: billede af tænder set forfra.',
        width: image.width, height: image.height, bytes: image.buffer.length,
      }), 'sagens billede');
    }
    if (approve) {
      mustOk(await input.patient.client.rpc('approve_summary', { p_case_id: row.id, p_summary_text: input.summary }), 'godkend opsummering');
    }
    return row.id;
  }

  async function sendLeads(patient: PatientHandle, caseId: string, clinicIds: string[]): Promise<Map<string, string>> {
    mustOk(await patient.client.rpc('send_leads', { p_case_id: caseId, p_clinic_ids: clinicIds }), 'send_leads');
    const leads = must(await admin.from('leads').select('id, clinic_id').eq('case_id', caseId), 'leads') as { id: string; clinic_id: string }[];
    return new Map(leads.map((l) => [l.clinic_id, l.id]));
  }

  async function accept(clinic: ClinicHandle, leadId: string, comment: string | null, quote: [number, number] | null): Promise<void> {
    mustOk(await clinic.client.rpc('clinic_decide_lead', {
      p_lead_id: leadId, p_decision: 'accept', p_comment: comment, p_quoted_min: quote ? quote[0] : null, p_quoted_max: quote ? quote[1] : null,
    }), 'accepter lead');
  }

  async function listPrice(clinic: ClinicHandle, slug: string): Promise<[number, number]> {
    const row = must(await admin.from('clinic_prices').select('price_min, price_max').eq('clinic_id', clinic.clinicId).eq('service_id', sid(slug)).single(), 'pris') as { price_min: number; price_max: number };
    return [row.price_min, row.price_max];
  }

  // Forhistorik: skriver en booking direkte (service role), fordi book_slot kun tillader fremtidige tider.
  async function insertPastBooking(
    clinic: ClinicHandle, patient: PatientHandle, leadId: string, slug: string, startsAt: Date, status: 'completed' | 'no_show' | 'booked',
  ): Promise<string> {
    // Databasen kræver hele kvarterer (bookings_starts_at_quarter); afrund ned.
    startsAt = new Date(Math.floor(startsAt.getTime() / 900_000) * 900_000);
    const duration = defaultDuration(slug);
    const endsAt = plusMinutes(startsAt, duration);
    const row = must(await admin.from('bookings').insert({
      lead_id: leadId, clinic_id: clinic.clinicId, patient_id: patient.userId, service_id: sid(slug),
      starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), status,
      contact_name: PATIENTS[patient.index].fullName, contact_phone: PATIENTS[patient.index].phone, contact_email: patient.email,
      completed_at: status === 'completed' ? plusMinutes(endsAt, 24 * 60).toISOString() : null,
      no_show_at: status === 'no_show' ? plusMinutes(endsAt, 60).toISOString() : null,
    }).select('id').single(), 'forhistorisk booking') as { id: string };
    mustOk(await admin.from('leads').update({ status: 'booked' }).eq('id', leadId), 'lead booked');
    return row.id;
  }

  // --- Hovedforløb: Mette (billeder, alle lead-statusser, kommende booking, beskedtråd) -------------------
  log('Opretter sager, leads og bookinger i alle statusser ...');
  const mainCase = await createCase({
    patient: p0, services: ['blegning', 'facing'], timeframe: 'within_2_weeks', images: 2,
    summary: 'Jeg ønsker at få lysere tænder og undersøge muligheden for facing på de øverste fortænder. Ingen smerter.',
  }, true);
  const mainLeads = await sendLeads(p0, mainCase, [v0.clinicId, v1.clinicId, v2.clinicId]);
  const leadV0 = mainLeads.get(v0.clinicId) as string;
  const leadV1 = mainLeads.get(v1.clinicId) as string;
  const leadV2 = mainLeads.get(v2.clinicId) as string;

  mustOk(await p0.client.from('messages').insert({ lead_id: leadV0, sender_id: p0.userId, body: 'Hej, kan I sige noget om, hvor lang tid blegning tager?' }), 'besked fra patient');
  mustOk(await v0.client.from('messages').insert({ lead_id: leadV0, sender_id: v0.userId, body: 'Hej Mette. En blegningsbehandling tager ca. en time. Vi gennemgår det ved konsultationen.' }), 'besked fra klinik');
  await accept(v0, leadV0, 'Vi kan hjælpe med begge dele. Kom gerne forbi.', [2300, 3600]);
  mustOk(await v1.client.rpc('clinic_decide_lead', { p_lead_id: leadV1, p_decision: 'decline', p_decline_reason: 'no_capacity', p_decline_note: 'Vi har ikke kapacitet de næste uger.' }), 'afvis lead');
  mustOk(await p0.client.rpc('withdraw_lead', { p_lead_id: leadV2 }), 'træk lead tilbage');
  await sendLeads(p0, mainCase, [v3.clinicId]); // nyt, ubesvaret lead efter tilbagetrækning

  const upcoming = nextWeekday(3);
  mustOk(await p0.client.rpc('book_slot', {
    p_lead_id: leadV0, p_service_id: sid('blegning'), p_starts_at: localToUtc(upcoming, 10, 0).toISOString(),
    p_contact_name: PATIENTS[0].fullName, p_contact_phone: PATIENTS[0].phone,
  }), 'book tid');

  // --- Jonas: accepteret lead uden booking + ubesvaret lead ---------------------------------------------
  const jonasCase = await createCase({
    patient: p1, services: ['undersoegelse', 'tandrensning'], timeframe: 'within_3_months',
    summary: 'Jeg har ikke været til tandlæge i flere år og ønsker en undersøgelse og tandrensning.',
  }, true);
  const jonasLeads = await sendLeads(p1, jonasCase, [v1.clinicId, v2.clinicId]);
  await accept(v1, jonasLeads.get(v1.clinicId) as string, null, null);

  // --- Forhistorik: 9 afsluttede bookinger med godkendte anmeldelser (3 pr. klinik v0-v2) ---------------
  log('Opretter afsluttede bookinger og godkendte anmeldelser ...');
  const historyClinics = [v0, v1, v2];
  const historyServices = ['undersoegelse', 'tandrensning', 'blegning'];
  let planIndex = 0;
  const reviewIds: string[] = [];
  for (const patient of [p0, p1, p2]) {
    for (const [k, clinic] of historyClinics.entries()) {
      const slug = historyServices[(patient.index + k) % historyServices.length];
      const caseId = await createCase({
        patient, services: [slug], timeframe: 'flexible', summary: `Jeg ønsker ${slug === 'blegning' ? 'blegning' : slug === 'tandrensning' ? 'tandrensning' : 'en undersøgelse'}.`,
      }, true);
      const leads = await sendLeads(patient, caseId, [clinic.clinicId]);
      const leadId = leads.get(clinic.clinicId) as string;
      const [lMin, lMax] = await listPrice(clinic, slug);
      await accept(clinic, leadId, null, [lMin, lMax]);
      const daysAgo = 4 + k * 2 + patient.index * 9;
      const startsAt = localToUtc(addDays(todayLocal(), -daysAgo), 10, 0);
      const bookingId = await insertPastBooking(clinic, patient, leadId, slug, startsAt, 'completed');

      const plan = REVIEW_PLANS[planIndex % REVIEW_PLANS.length];
      planIndex += 1;
      const review = must(await admin.from('reviews').insert({
        booking_id: bookingId, clinic_id: clinic.clinicId, patient_id: patient.userId, stars: plan.stars, text: REVIEW_TEXTS[plan.text],
        price_accuracy: plan.accuracy, actual_price: plan.accuracy === 'as_quoted' ? null : Math.round(lMax * (plan.accuracy === 'much_higher' ? 1.4 : 1.12)),
        lacked_transparency: plan.transparency, transparency_comment: plan.transparency ? 'Ekstra omkostninger blev ikke nævnt på forhånd.' : null,
      }).select('id').single(), 'anmeldelse') as { id: string };
      mustOk(await admin.from('reviews').update({ moderation_status: 'approved', moderated_at: new Date().toISOString() }).eq('id', review.id), 'godkend anmeldelse');
      reviewIds.push(review.id);
    }
  }
  // Klinikkens offentlige svar på de to første anmeldelser (godkendt)
  for (const [i, reviewId] of reviewIds.slice(0, 2).entries()) {
    const reply = must(await admin.from('review_replies').insert({
      review_id: reviewId, clinic_id: (i === 0 ? v0 : v1).clinicId, text: 'Tak for din anmeldelse. Vi er glade for, at du var tilfreds.',
    }).select('id').single(), 'svar') as { id: string };
    mustOk(await admin.from('review_replies').update({ moderation_status: 'approved', moderated_at: new Date().toISOString() }).eq('id', reply.id), 'godkend svar');
  }

  // --- Sofie: booking der netop er slut (stadig inden for 24 timers fristen) ------------------------------
  const sofieCase = await createCase({
    patient: p2, services: ['fyldning'], timeframe: 'asap', summary: 'En fyldning er faldet ud, og jeg ønsker den lavet igen.',
  }, true);
  const sofieLeads = await sendLeads(p2, sofieCase, [v3.clinicId]);
  const sofieLead = sofieLeads.get(v3.clinicId) as string;
  const [fMin, fMax] = await listPrice(v3, 'fyldning');
  await accept(v3, sofieLead, null, [fMin, fMax]);
  await insertPastBooking(v3, p2, sofieLead, 'fyldning', plusMinutes(new Date(), -150), 'booked');

  // --- Emil: udeblivelse (no_show) og en reserveret akuttid (held) ---------------------------------------
  const emilCase = await createCase({
    patient: p3, services: ['undersoegelse'], timeframe: 'flexible', summary: 'Jeg ønsker en almindelig undersøgelse.',
  }, true);
  const emilLeads = await sendLeads(p3, emilCase, [v3.clinicId]);
  const emilLead = emilLeads.get(v3.clinicId) as string;
  await accept(v3, emilLead, null, null);
  await insertPastBooking(v3, p3, emilLead, 'undersoegelse', localToUtc(addDays(todayLocal(), -6), 13, 0), 'no_show');

  const emergencyCase = await createCase({
    patient: p3, services: ['akut_konsultation'], timeframe: 'asap', emergency: true, summary: 'Jeg har kraftig tandpine siden i går og har brug for hjælp hurtigst muligt.',
  }, true);
  const heldDay = nextWeekday(1);
  mustOk(await p3.client.rpc('send_leads', {
    p_case_id: emergencyCase, p_clinic_ids: [v0.clinicId], p_requested_service_id: sid('akut_konsultation'),
    p_requested_starts_at: localToUtc(heldDay, 16, 30).toISOString(), p_contact_name: PATIENTS[3].fullName, p_contact_phone: PATIENTS[3].phone,
  }), 'akut-lead med reservation');

  // --- Laura: kladde uden leads --------------------------------------------------------------------------
  await createCase({ patient: p4, services: ['retainer'], timeframe: 'flexible', summary: 'Min retainer er knækket.' }, false);

  // --- Resultat ------------------------------------------------------------------------------------------
  const counts: Record<string, number> = {};
  for (const table of ['clinics', 'leads', 'bookings', 'reviews', 'cases']) {
    const { count } = await admin.from(table).select('id', { count: 'exact', head: true });
    counts[table] = count ?? 0;
  }
  log('');
  log('Demodata er oprettet.');
  log(`  Rækker: ${Object.entries(counts).map(([t, n]) => `${t}=${n}`).join(', ')}`);
  log(`  Adgangskode til alle demo-brugere (vises kun nu): ${password}`);
  log(`  Patienter:  patient1..patient5${DEMO_EMAIL_SUFFIX}`);
  log(`  Klinikker:  klinik-v0..klinik-v3${DEMO_EMAIL_SUFFIX} (verificerede), klinik-registreret${DEMO_EMAIL_SUFFIX}`);
  log('  Bemærk: den reserverede akuttid (held) udløber efter 30 minutter.');
}

// Standardvarigheder fra supabase/migrations/…_services_catalog.sql (bruges til prislistens varighed og forhistorik).
function defaultDuration(slug: string): number {
  const durations: Record<string, number> = {
    undersoegelse: 30, tandrensning: 45, fyldning: 45, roentgen: 15, rodbehandling: 90, krone: 60, tandudtraekning: 45,
    blegning: 60, facing: 90, diastema: 60, retainer: 30, tandregulering_konsultation: 45, akut_konsultation: 30, akut_smertebehandling: 45,
  };
  return durations[slug] ?? 30;
}

async function main(): Promise<void> {
  const config = readConfig(process.argv.slice(2));
  await seed(config);
}

// Kør kun ved direkte kald (unseed-demo.ts importerer filen for at genbruge cleanupDemo).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
