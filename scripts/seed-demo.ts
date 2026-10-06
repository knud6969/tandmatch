// Demo-seed for TandMatch (architecture 2.3, 4.3). Kun fiktive data.
// Opretter demo-tandlæger, klinikker, priser, postnummer-katalog og en demo-patient.
// Brugere oprettes med auth.admin.createUser, så signup-triggeren (handle_new_user) opretter rækkerne.
// is_verified og klinik sættes bagefter med service role-klienten.
//
// Idempotent: eksisterende demo-brugere (@demo.tandmatch.test) opdateres og slettes ikke.
// Adgangskoden er tilfældig pr. kørsel og vises kun én gang i terminalen.
//
// Kørsel (se rapport): node --env-file=.env.local scripts/seed-demo.ts
//                      eller npx tsx --env-file=.env.local scripts/seed-demo.ts
//                      --dry-run viser planen uden at kalde Supabase.

import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

const DEMO_EMAIL_SUFFIX = '@demo.tandmatch.test';
const DRY_RUN = process.argv.includes('--dry-run');

type Service = 'undersoegelse' | 'tandrensning' | 'fyldning' | 'akut_konsultation';
type CosmeticCategory = 'diastema' | 'facings' | 'blegning' | 'retainer' | 'andet_kosmetisk';

interface PostalCode {
  postal_code: string;
  city: string;
  lat: number;
  lng: number;
}

// Koordinater er CA.-værdier for postnummerets centrum (afstandssortering i demoen).
// De er ikke hentet fra DAWA og skal verificeres før produktion.
const POSTAL_CODES: PostalCode[] = [
  { postal_code: '1050', city: 'København K', lat: 55.6803, lng: 12.5857 },
  { postal_code: '1200', city: 'København K', lat: 55.6748, lng: 12.589 },
  { postal_code: '1500', city: 'København V', lat: 55.6683, lng: 12.5632 },
  { postal_code: '2000', city: 'Frederiksberg', lat: 55.6785, lng: 12.5307 },
  { postal_code: '2100', city: 'København Ø', lat: 55.7088, lng: 12.5863 },
  { postal_code: '2200', city: 'København N', lat: 55.693, lng: 12.551 },
  { postal_code: '2300', city: 'København S', lat: 55.6605, lng: 12.595 },
  { postal_code: '2400', city: 'København NV', lat: 55.703, lng: 12.542 },
  { postal_code: '2500', city: 'Valby', lat: 55.664, lng: 12.512 },
  { postal_code: '2600', city: 'Glostrup', lat: 55.664, lng: 12.399 },
  { postal_code: '2650', city: 'Hvidovre', lat: 55.647, lng: 12.456 },
  { postal_code: '2700', city: 'Brønshøj', lat: 55.7, lng: 12.499 },
  { postal_code: '2800', city: 'Kongens Lyngby', lat: 55.77, lng: 12.504 },
  { postal_code: '2900', city: 'Hellerup', lat: 55.7315, lng: 12.577 },
  { postal_code: '3000', city: 'Helsingør', lat: 56.0361, lng: 12.6131 },
  { postal_code: '4000', city: 'Roskilde', lat: 55.6415, lng: 12.0803 },
  { postal_code: '5000', city: 'Odense C', lat: 55.4038, lng: 10.3883 },
  { postal_code: '6700', city: 'Esbjerg', lat: 55.4765, lng: 8.4594 },
  { postal_code: '7100', city: 'Vejle', lat: 55.7093, lng: 9.5357 },
  { postal_code: '8000', city: 'Aarhus C', lat: 56.1572, lng: 10.2107 },
  { postal_code: '9000', city: 'Aalborg', lat: 57.0488, lng: 9.9217 },
];

interface DemoDentist {
  n: number;
  postalCode: string;
  clinicName: string;
  address: string;
  nextAvailableInDays: number;
  acceptsCosmetic: boolean;
  cosmeticCategories: CosmeticCategory[];
  priceFactor: number;
}

// Alle navne, klinikker og adresser er fiktive. Gadenavne er konstrueret til demoen.
const DEMO_DENTISTS: DemoDentist[] = [
  { n: 1, postalCode: '2200', clinicName: 'Demo Tandklinik Nørrebro', address: 'Demogade 1', nextAvailableInDays: 2, acceptsCosmetic: true, cosmeticCategories: ['diastema', 'facings'], priceFactor: 1 },
  { n: 2, postalCode: '2100', clinicName: 'Demo Tandklinik Østerbro', address: 'Demovej 2', nextAvailableInDays: 5, acceptsCosmetic: false, cosmeticCategories: [], priceFactor: 1.1 },
  { n: 3, postalCode: '2000', clinicName: 'Demo Tandklinik Frederiksberg', address: 'Eksempelstræde 3', nextAvailableInDays: 1, acceptsCosmetic: true, cosmeticCategories: ['blegning', 'retainer'], priceFactor: 1.25 },
  { n: 4, postalCode: '2300', clinicName: 'Demo Tandklinik Amager', address: 'Fiktivvej 4', nextAvailableInDays: 9, acceptsCosmetic: false, cosmeticCategories: [], priceFactor: 0.95 },
  { n: 5, postalCode: '2800', clinicName: 'Demo Tandklinik Lyngby', address: 'Prøvevej 5', nextAvailableInDays: 3, acceptsCosmetic: true, cosmeticCategories: ['andet_kosmetisk', 'blegning'], priceFactor: 1.05 },
  { n: 6, postalCode: '4000', clinicName: 'Demo Tandklinik Roskilde', address: 'Demotorvet 6', nextAvailableInDays: 14, acceptsCosmetic: false, cosmeticCategories: [], priceFactor: 0.9 },
];

const DEMO_PATIENT = { n: 1, firstName: 'Demo Patient 1', postalCode: '2200' };

// Fiktive demopriser i DKK. De er ikke markedspriser.
const BASE_PRICES: Record<Service, { min: number; max: number }> = {
  undersoegelse: { min: 400, max: 700 },
  tandrensning: { min: 800, max: 1200 },
  fyldning: { min: 900, max: 1600 },
  akut_konsultation: { min: 600, max: 1000 },
};

function roundTo50(value: number): number {
  return Math.round(value / 50) * 50;
}

function dentistEmail(n: number): string {
  return `demo-tandlaege-${n}${DEMO_EMAIL_SUFFIX}`;
}

function patientEmail(n: number): string {
  return `demo-patient-${n}${DEMO_EMAIL_SUFFIX}`;
}

function isDemoEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(DEMO_EMAIL_SUFFIX);
}

function pricesFor(d: DemoDentist) {
  const services = Object.keys(BASE_PRICES) as Service[];
  return services.map((service) => {
    const base = BASE_PRICES[service];
    const min = roundTo50(base.min * d.priceFactor);
    const max = roundTo50(base.max * d.priceFactor);
    return {
      service,
      price_min: min,
      price_max: max,
      note: service === 'undersoegelse' ? 'Demopris (fiktiv)' : null,
    };
  });
}

function postalCodeFor(code: string): PostalCode {
  const found = POSTAL_CODES.find((p) => p.postal_code === code);
  if (!found) {
    throw new Error(`Postnummer ${code} findes ikke i demo-kataloget`);
  }
  return found;
}

function printPlan(): void {
  console.log('Demo-seed: planen (ingen kald mod Supabase i --dry-run)');
  console.log(`- Postnumre i katalog: ${POSTAL_CODES.length}`);
  console.log(`- Patient: ${patientEmail(DEMO_PATIENT.n)} (${DEMO_PATIENT.firstName}, ${DEMO_PATIENT.postalCode})`);
  for (const d of DEMO_DENTISTS) {
    const pc = postalCodeFor(d.postalCode);
    console.log(
      `- Tandlæge ${d.n}: ${dentistEmail(d.n)} | klinik "${d.clinicName}", ${d.address}, ${d.postalCode} ${pc.city} | ` +
        `kosmetik: ${d.acceptsCosmetic ? d.cosmeticCategories.join(', ') : 'nej'} | næste ledige tid om ${d.nextAvailableInDays} dage`,
    );
  }
  console.log('- Alle tandlæger får is_verified = true og er aktive.');
  console.log('- Kør uden --dry-run for at oprette/opdatere. Adgangskoden genereres og vises ved kørsel.');
}

async function listDemoUsers(admin: SupabaseClient): Promise<Map<string, User>> {
  const found = new Map<string, User>();
  const perPage = 200;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers fejlede: ${error.message}`);
    for (const user of data.users) {
      if (isDemoEmail(user.email)) found.set(user.email!.toLowerCase(), user);
    }
    if (data.users.length < perPage) break;
  }
  return found;
}

async function upsertUser(
  admin: SupabaseClient,
  existing: Map<string, User>,
  email: string,
  password: string,
  metadata: Record<string, string>,
): Promise<string> {
  const current = existing.get(email.toLowerCase());
  if (current) {
    // Opdaterer adgangskode og metadata. Rækker i profiles/dentists/patients røres ikke af triggeren her.
    const { data, error } = await admin.auth.admin.updateUserById(current.id, {
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error || !data.user) throw new Error(`Kunne ikke opdatere ${email}: ${error?.message ?? 'ukendt fejl'}`);
    return data.user.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error || !data.user) throw new Error(`Kunne ikke oprette ${email}: ${error?.message ?? 'ukendt fejl'}`);
  return data.user.id;
}

async function upsertPostalCodes(admin: SupabaseClient): Promise<void> {
  const { error } = await admin.from('postal_codes').upsert(POSTAL_CODES, { onConflict: 'postal_code' });
  if (error) throw new Error(`postal_codes upsert fejlede: ${error.message}`);
}

async function seedPatient(admin: SupabaseClient, existing: Map<string, User>, password: string): Promise<string> {
  const userId = await upsertUser(admin, existing, patientEmail(DEMO_PATIENT.n), password, {
    role: 'patient',
    first_name: DEMO_PATIENT.firstName,
  });
  const { data, error } = await admin
    .from('patients')
    .update({ postal_code: DEMO_PATIENT.postalCode })
    .eq('id', userId)
    .select('id');
  if (error) throw new Error(`patients update fejlede: ${error.message}`);
  if (!data || data.length !== 1) throw new Error('Demo-patienten mangler patients-række (signup-trigger)');
  return userId;
}

async function seedDentist(
  admin: SupabaseClient,
  existing: Map<string, User>,
  password: string,
  d: DemoDentist,
): Promise<string> {
  const fullName = `Demo Tandlæge ${d.n}`;
  const userId = await upsertUser(admin, existing, dentistEmail(d.n), password, {
    role: 'dentist',
    full_name: fullName,
    authorization_id: `DEMO-000${d.n}`,
  });

  const pc = postalCodeFor(d.postalCode);
  const clinicFields = {
    name: d.clinicName,
    address: d.address,
    postal_code: pc.postal_code,
    city: pc.city,
    lat: pc.lat,
    lng: pc.lng,
  };

  const { data: existingClinic, error: findErr } = await admin
    .from('clinics')
    .select('id')
    .eq('created_by', userId)
    .limit(1);
  if (findErr) throw new Error(`clinics select fejlede: ${findErr.message}`);

  let clinicId: string;
  if (existingClinic && existingClinic.length > 0) {
    clinicId = existingClinic[0].id as string;
    const { error } = await admin.from('clinics').update(clinicFields).eq('id', clinicId);
    if (error) throw new Error(`clinics update fejlede: ${error.message}`);
  } else {
    const { data, error } = await admin
      .from('clinics')
      .insert({ ...clinicFields, created_by: userId })
      .select('id')
      .single();
    if (error || !data) throw new Error(`clinics insert fejlede: ${error?.message ?? 'ukendt fejl'}`);
    clinicId = data.id as string;
  }

  const nextAvailableAt = new Date(Date.now() + d.nextAvailableInDays * 24 * 60 * 60 * 1000).toISOString();
  const { data: updated, error: dentistErr } = await admin
    .from('dentists')
    .update({
      full_name: fullName,
      title: 'Tandlæge (demo)',
      bio: 'Fiktiv demoprofil til TandMatch. Der er ingen rigtig tandlæge bag profilen.',
      is_active: true,
      accepts_cosmetic: d.acceptsCosmetic,
      cosmetic_categories: d.cosmeticCategories,
      next_available_at: nextAvailableAt,
      next_available_updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('id');
  if (dentistErr) throw new Error(`dentists update fejlede: ${dentistErr.message}`);
  if (!updated || updated.length !== 1) throw new Error(`Demo-tandlæge ${d.n} mangler dentists-række (signup-trigger)`);

  // is_verified og clinic_id sættes kun via den bevidste admin-sti (migration demo_set_dentist_verification).
  const { error: verifyErr } = await admin.rpc('demo_set_dentist_verification', {
    p_user_id: userId,
    p_clinic_id: clinicId,
    p_verified: true,
  });
  if (verifyErr) throw new Error(`demo_set_dentist_verification fejlede: ${verifyErr.message}`);

  const prices = pricesFor(d).map((p) => ({ ...p, clinic_id: clinicId }));
  const { error: priceErr } = await admin.from('clinic_prices').upsert(prices, { onConflict: 'clinic_id,service' });
  if (priceErr) throw new Error(`clinic_prices upsert fejlede: ${priceErr.message}`);

  return userId;
}

async function verify(admin: SupabaseClient, ids: string[]): Promise<number> {
  const { data, error } = await admin
    .from('dentists')
    .select('id, is_verified, clinic_id')
    .in('id', ids);
  if (error) throw new Error(`Kontrol af dentists fejlede: ${error.message}`);
  return (data ?? []).filter((r) => r.is_verified === true && r.clinic_id !== null).length;
}

async function main(): Promise<void> {
  if (DRY_RUN) {
    printPlan();
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      'Mangler NEXT_PUBLIC_SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY i miljøet. Kør med --env-file=.env.local.',
    );
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Tilfældig adgangskode pr. kørsel. Vises én gang og gemmes ikke.
  const password = randomBytes(18).toString('base64url');

  console.log('Demo-seed: opretter/opdaterer demo-data (kun @demo.tandmatch.test)...');
  const existing = await listDemoUsers(admin);
  await upsertPostalCodes(admin);
  console.log(`- Postnumre: ${POSTAL_CODES.length} upserted`);

  const patientId = await seedPatient(admin, existing, password);
  console.log(`- Patient: ${patientEmail(DEMO_PATIENT.n)}`);

  const dentistIds: string[] = [];
  for (const d of DEMO_DENTISTS) {
    dentistIds.push(await seedDentist(admin, existing, password, d));
    console.log(`- Tandlæge ${d.n}: ${dentistEmail(d.n)} + klinik "${d.clinicName}"`);
  }

  const verified = await verify(admin, dentistIds);
  console.log(`- Verificerede demo-tandlæger med klinik: ${verified}/${DEMO_DENTISTS.length}`);
  if (verified !== DEMO_DENTISTS.length) {
    throw new Error('Ikke alle demo-tandlæger blev verificeret. Tjek migrationer og dentists_guard.');
  }
  console.log(`- Patient-id: ${patientId}`);

  console.log('');
  console.log('Demo-adgangskode (vises kun denne gang, gemmes ikke):');
  console.log(`  ${password}`);
  console.log('Log ind med en af: ' + DEMO_DENTISTS.map((d) => dentistEmail(d.n)).join(', ') + ' eller ' + patientEmail(DEMO_PATIENT.n));
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Demo-seed fejlede: ${message}`);
  process.exit(1);
});
