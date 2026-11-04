// Opretter en admin-bruger (features/admin/README.md 3, platform 2.3 h).
//
// Kørsel: npm run admin:create -- --email <e-mail>
// Kører mod den LOKALE Supabase med miljøet i .env.test.local (som seed-scriptet) og nægter en ikke-lokal URL, medmindre
// --allow-remote gives udtrykkeligt. Mod et fælles projekt: kør scriptet med det miljø, du vil bruge, og giv --allow-remote.
//
// Signup-triggeren accepterer kun rollerne patient og clinic, så brugeren oprettes med en tilfældig adgangskode og
// role = 'patient' i metadata; derefter sættes profiles.role = 'admin', og patients-rækken slettes. Adgangskoden vises aldrig:
// sæt en ny via "Glemt adgangskode" på /login. (Lokalt lander e-mailen i Supabases Inbucket, http://127.0.0.1:54324.)

import { randomBytes } from 'node:crypto';

type SeedModule = {
  readConfig: (argv: string[]) => { url: string; anonKey: string; serviceKey: string };
  createAdmin: (config: { url: string; anonKey: string; serviceKey: string }) => AdminClient;
};

// Det, scriptet bruger af service role-klienten (skrevet ud, så filen ikke afhænger af supabase-js' typer).
type AdminClient = {
  auth: { admin: { createUser: (attrs: Record<string, unknown>) => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }> } };
  from: (table: string) => {
    update: (values: Record<string, unknown>) => { eq: (column: string, value: string) => Promise<{ error: { message: string } | null }> };
    delete: () => { eq: (column: string, value: string) => Promise<{ error: { message: string } | null }> };
  };
};

export function parseEmail(argv: string[]): string {
  const index = argv.indexOf('--email');
  const email = index >= 0 ? argv[index + 1]?.trim().toLowerCase() : undefined;
  if (!email || email.startsWith('--') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Brug: npm run admin:create -- --email <e-mail>');
  }
  return email;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const email = parseEmail(argv);
  // Genbruger seed-scriptets miljølæsning og lokal-vagt (nægter ikke-lokal URL uden --allow-remote).
  const modulePath = './seed-demo.ts';
  const seed = (await import(modulePath)) as SeedModule;
  const admin = seed.createAdmin(seed.readConfig(argv));

  const password = randomBytes(24).toString('base64url');
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role: 'patient' } });
  if (created.error || !created.data.user) {
    throw new Error(`Brugeren kunne ikke oprettes: ${created.error?.message ?? 'ukendt fejl'}`);
  }
  const id = created.data.user.id;

  const promoted = await admin.from('profiles').update({ role: 'admin' }).eq('id', id);
  if (promoted.error) throw new Error(`Rollen kunne ikke sættes: ${promoted.error.message}`);
  // En admin er ingen patient: patientrækken (fornavn m.m.) slettes, så admin ikke har patientdata.
  const cleaned = await admin.from('patients').delete().eq('id', id);
  if (cleaned.error) throw new Error(`Patientrækken kunne ikke fjernes: ${cleaned.error.message}`);

  console.log(`Admin oprettet: ${email}. Sæt en adgangskode via "Glemt adgangskode" på /login.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
