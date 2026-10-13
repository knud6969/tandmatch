# TandMatch: persondata og sikkerhed (oversigt)

Vedligeholdes af security-agenten. Kort oversigt over hvilke data platformen behandler, hvorfor, hvor de ligger, hvor længe og hvem der har adgang. Detaljer står i `docs/architecture.md` (henvisninger i parentes). Status: prototype; ingen rigtige patientdata. Seed- og testdata er fiktive.

## Hvor data ligger

| Hvad | Hvor |
|---|---|
| Database, Auth, filer | Supabase, **EU-region** (2.3, 2.3.1). Bucket `case-images` er privat; `public-media` er offentlig |
| AI-behandling | OpenAI API, kaldt fra serveren (7.2). Ingen streaming, intet fra browseren. AI-flowet er [IKKE BYGGET] i den nye model; reglerne nedenfor gælder, når det bygges |
| Nøgler | Kun server (`.env.local`, ikke i git). Browseren har kun Supabase URL og anon-nøgle (offentlige af design, beskyttet af RLS) |

## Data, formål, grundlag og opbevaring

| Data | Hvem | Formål | Grundlag | Opbevaring og sletning |
|---|---|---|---|---|
| Vilkårs-accept (cookie `tm_terms`, `terms_acceptances`) | alle | Dokumentere accept af vilkår og læst privatlivspolitik | Aftale | Cookie 12 mdr.; rækker følger kontoen |
| Anonym session: chat, mundfotos, opsummering, valgte ydelser | anonym patient | Beskrive tandproblemet før kontooprettelse | Udtrykkeligt samtykke (art. 9): `ai_processing`, `image_upload` | Slettes 48 timer efter seneste aktivitet (cronjob) eller med ét klik |
| Konto: e-mail, fornavn, postnummer, telefon | patient | Login, sag, booking | Aftale | Til kontoen slettes. Fast opbevaringsperiode: **[UDSKUDT]** (arkitektur 12.4) |
| Sag: beskrivelse, mundfotos, AI-opsummering, ydelser | patient | Sende sagen til klinikker, patienten selv vælger | Samtykke: `image_upload`, `health_data_sharing` (med tidspunkt og tekstversion, kan trækkes tilbage) | Til sagen/kontoen slettes eller samtykket trækkes tilbage (billeder slettes, leads trækkes tilbage) |
| Leads, beskeder | patient og klinik | Kontakt om en konkret sag | Samtykke `health_data_sharing` | Følger patientens konto |
| Booking: kontaktnavn, telefon, e-mail | patient → klinik | Klinikken skal kunne kontakte patienten om tiden | Aftale/samtykke | Følger patientens konto. Klinikken ser dem kun for egne bookinger med status `booked`/`completed` |
| Anmeldelser | patient | Verificerede anmeldelser | Aftale | Følger kontoen (moderation [IKKE BYGGET]) |
| Klinikkonto: e-mail, CVR, klinikdata, tandlægers navn/titel/bio/portræt | klinik | Profil, prisliste, leads | Aftale | Ved sletning: filer i `public-media` og auth-bruger slettes; rækkerne ryddes af triggeren (5.3). Importeret klinik: kun offentlige grunddata bevares. Selvoprettet: `removed`, kun navn og adresse bevares, så patienternes historik har en klinik at pege på |
| Porteføljebilleder (før/efter) | klinik | Vise klinikkens arbejde | Klinikkens erklæring om patientens skriftlige samtykke (version og tidspunkt gemmes); klinikken er dataansvarlig | Til klinikken sletter dem eller kontoen |
| Importerede klinikdata (fx CVR) | offentlige erhvervsdata, kan indeholde tandlægens navn | Klinikoversigt | Legitim interesse | Fjernes på anmodning (admin). Kilden skal stå i privatlivspolitikken |
| Rate limits | alle | Misbrugsværn | Legitim interesse | IP gemmes kun som SHA-256-hash; nøgle pr. time |

## Hvem har adgang

- **Patient:** egne data. Kan eksportere og slette konto, sager og billeder og trække samtykker tilbage.
- **Klinik:** kun egne leads (fra `owner_since`, kun som verificeret), sagens godkendte indhold og billeder med aktivt samtykke, egne beskeder via funktion uden `sender_id`. Aldrig `patient_id`, aldrig AI-chatten, kontakt kun efter booking. Håndhævet i databasen (RLS, 5).
- **Admin:** klinikstatus og moderation. Ingen adgang til sager, chat, billeder, leads, bookinger eller beskeder.
- **Service role (server):** kun formålene i 2.3 (AI-skrivninger, rate limits, filer, signerede URL'er à 5 min, sletning af auth-bruger, cronjobs, seed). Aldrig til at læse data på brugerens vegne.
- **Offentligheden:** kun `public_*`-funktioner: verificerede klinikker (fuld profil) og importerede uden ejer (grunddata). `registered` og `removed` er usynlige.

## Databehandlere

| Behandler | Rolle | Status |
|---|---|---|
| Supabase | Hosting af database, Auth og filer (EU) | Databehandleraftale (DPA) skal accepteres i Supabase-kontoen før rigtige data. **[ÅBEN]** |
| OpenAI | AI-chat og opsummering. Modtager aldrig navn, e-mail, telefon, adresse, postnummer, `patient_id` eller priser; tekst PII-maskeres; billeder re-encodes uden EXIF | DPA skal underskrives, og det skal verificeres i kontoen, at API-data ikke bruges til træning (standard), og om zero data retention kan fås. **[ÅBEN]** |
| Hosting af Next.js | Server-routes | Ikke valgt; skal være EU-region og have DPA. **[ÅBEN]** |

## Kendte kompromiser i prototypen

1. **CVR-overtagelse uden bevis for ejerskab.** En overtaget klinik er usynlig (`registered`), indtil admin verificerer. Slettes en uverificeret ejer, gendannes de importerede grunddata fra et snapshot (migration `20261016000100`). Bevis for ejerskab skal på plads før rigtige brugere.
2. **CSP tillader `'unsafe-inline'` for scripts og styles** (Next.js-hydrering). Nonce-baseret CSP før drift.
3. **Opbevaringsperiode for kontodata** er ikke fastsat, og der er ingen automatisk sletning af inaktive konti.
4. **Rate limit pr. IP** stoler på `x-forwarded-for`; hostingudbyderen skal overskrive headeren. IP-hashen er uden salt og kan i princippet brute-forces.
5. **Porteføljesamtykke** er klinikkens erklæring med en pladsholdertekst; juridisk gennemgang mangler (12.4).
6. **E-mailbekræftelse er slået fra** (2.3.1).
7. **Privatlivspolitikken** (`/privatliv`) er en prototype og skal nævne CVR som kilde, databehandlerne og opbevaringsperioder før drift.
8. **Foreløbige faglige vurderinger fra AI'en** er tilladt i prototypen; MDR-tilpasning sker senere.
