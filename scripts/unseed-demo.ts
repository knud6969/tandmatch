// Fjerner demodata oprettet af scripts/seed-demo.ts: brugere med @demo.tandmatch.test, deres sager, leads,
// bookinger og anmeldelser, klinikker med import_source = 'seed' og tilhørende filer i storage.
// Postnumre (migrationen 20261028000400) og ydelseskataloget røres ikke.
//
// Kører kun mod lokal Supabase, medmindre --allow-remote gives. --dry-run viser kun, hvad der ville blive slettet.
// Kørsel: npm run unseed:demo

type SeedModule = {
  readConfig: (argv: string[]) => { url: string; anonKey: string; serviceKey: string };
  createAdmin: (config: { url: string; anonKey: string; serviceKey: string }) => unknown;
  cleanupDemo: (admin: unknown, dryRun: boolean) => Promise<{ users: number; clinics: number; files: number }>;
};

async function main(): Promise<void> {
  // Dynamisk import med variabel sti, så filen kan genbruge seed-scriptets oprydning uden .ts-endelse i tsc.
  const modulePath = './seed-demo.ts';
  const seed = (await import(modulePath)) as SeedModule;
  const argv = process.argv.slice(2);
  const config = seed.readConfig(argv);
  const dryRun = argv.includes('--dry-run');
  const summary = await seed.cleanupDemo(seed.createAdmin(config), dryRun);
  console.log(
    `${dryRun ? 'Ville slette' : 'Slettet'}: ${summary.users} brugere, ${summary.clinics} klinikker` +
      (dryRun ? '.' : `, ${summary.files} filer.`),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
