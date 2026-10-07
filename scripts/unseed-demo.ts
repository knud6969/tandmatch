// Sletter demo-data fra scripts/seed-demo.ts. Rør kun brugere med @demo.tandmatch.test.
// Standard er en tør kørsel, der kun viser hvad der ville blive slettet.
// Sletning sker kun med --yes.
//
// Kørsel (se rapport): node --env-file=.env.local scripts/unseed-demo.ts
//                      node --env-file=.env.local scripts/unseed-demo.ts --yes
//
// Postnummer-kataloget slettes ikke, fordi det er offentlige opslagsdata og bruges af appen.

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

const DEMO_EMAIL_SUFFIX = '@demo.tandmatch.test';
const CONFIRM = process.argv.includes('--yes');

function isDemoEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(DEMO_EMAIL_SUFFIX);
}

async function listDemoUsers(admin: SupabaseClient): Promise<User[]> {
  const found: User[] = [];
  const perPage = 200;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers fejlede: ${error.message}`);
    for (const user of data.users) {
      if (isDemoEmail(user.email)) found.push(user);
    }
    if (data.users.length < perPage) break;
  }
  return found;
}

async function main(): Promise<void> {
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

  const users = await listDemoUsers(admin);
  const ids = users.map((u) => u.id);
  console.log(`Demo-brugere fundet (@demo.tandmatch.test): ${ids.length}`);
  for (const u of users) console.log(`- ${u.email}`);

  if (ids.length === 0) {
    console.log('Intet at slette.');
    return;
  }

  // Klinikker oprettet af demo-brugere slettes eksplicit. created_by sættes kun til null ved brugersletning.
  const { data: clinics, error: clinicErr } = await admin.from('clinics').select('id, name').in('created_by', ids);
  if (clinicErr) throw new Error(`clinics select fejlede: ${clinicErr.message}`);
  console.log(`Klinikker oprettet af demo-brugere: ${clinics?.length ?? 0}`);

  if (!CONFIRM) {
    console.log('Tør kørsel. Kør igen med --yes for at slette.');
    return;
  }

  // Demo-data knyttet til demo-brugere: anmeldelser, besøg og forespørgsler (med svar og modtagere).
  // Sletningen er eksplicit, så den ikke kun afhænger af cascade. Kun demo-brugernes id'er bruges.
  const { data: reviews, error: reviewErr } = await admin.from('reviews').delete().in('patient_id', ids).select('id');
  if (reviewErr) throw new Error(`reviews delete fejlede: ${reviewErr.message}`);
  const { data: visits, error: visitErr } = await admin
    .from('visits')
    .delete()
    .or(`patient_id.in.(${ids.join(',')}),dentist_id.in.(${ids.join(',')})`)
    .select('id');
  if (visitErr) throw new Error(`visits delete fejlede: ${visitErr.message}`);
  const { data: requests, error: requestErr } = await admin.from('requests').delete().in('patient_id', ids).select('id');
  if (requestErr) throw new Error(`requests delete fejlede: ${requestErr.message}`);
  console.log(
    `Demo-data: ${requests?.length ?? 0} forespørgsler, ${visits?.length ?? 0} besøg, ${reviews?.length ?? 0} anmeldelser.`,
  );

  if (clinics && clinics.length > 0) {
    const clinicIds = clinics.map((c) => c.id as string);
    const { error } = await admin.from('clinics').delete().in('id', clinicIds);
    if (error) throw new Error(`clinics delete fejlede: ${error.message}`);
  }

  // Sletning af auth-brugeren kaskaderer til profiles, patients, dentists og afledte rækker.
  for (const u of users) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) throw new Error(`deleteUser fejlede for ${u.email}: ${error.message}`);
  }
  console.log(`Slettet: ${users.length} demo-brugere og ${clinics?.length ?? 0} klinikker.`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Unseed fejlede: ${message}`);
  process.exit(1);
});
