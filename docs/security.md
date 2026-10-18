# TandMatch: persondata og sikkerhed (oversigt)

Vedligeholdes af security-agenten. Kort oversigt over hvilke data platformen behandler, hvorfor, hvor de ligger, hvor længe og hvem der har adgang. Detaljer står i `docs/architecture.md` (henvisninger i parentes). Status: prototype; ingen rigtige patientdata. Seed- og testdata er fiktive.

## Hvor data ligger

| Hvad | Hvor |
|---|---|
| Database, Auth, filer | Supabase, **EU-region** (2.3, 2.3.1). Bucket `case-images` er privat; `public-media` er offentlig |
| AI-behandling | OpenAI Responses API, kaldt fra serveren (7.2) med `store: false`. Ingen streaming, intet fra browseren. Bygget i trin 3 (chat og opsummering) |
| Nøgler | Kun server (`.env.local`, ikke i git). Browseren har kun Supabase URL og anon-nøgle (offentlige af design, beskyttet af RLS) |

## Data, formål, grundlag og opbevaring

| Data | Hvem | Formål | Grundlag | Opbevaring og sletning |
|---|---|---|---|---|
| Vilkårs-accept (cookie `tm_terms`, `terms_acceptances`) | alle | Dokumentere accept af vilkår og læst privatlivspolitik | Aftale | Cookie 12 mdr.; rækker følger kontoen |
| Anonym session: chat, mundfotos, opsummering, valgte ydelser | anonym patient | Beskrive tandproblemet før kontooprettelse | Udtrykkeligt samtykke (art. 9): `ai_processing`, `image_upload` | Slettes 48 timer efter seneste aktivitet (cronjob) eller med ét klik |
| Konto: e-mail, fornavn, postnummer, telefon | patient | Login, sag, booking | Aftale | Til kontoen slettes. Fast opbevaringsperiode: **[UDSKUDT]** (arkitektur 12.4) |
| AI-chat (`ai_messages`): patientens beskeder (PII-maskeret: e-mail, telefon, CPR, adresse, postnummer+by, navneudsagn) og assistentens svar, foreløbig vurdering, forslag | patient (også anonym) | Forstå patientens ønske og lave opsummeringen | Udtrykkeligt samtykke `ai_processing` (kræves før chat og opsummering) | Slettes med sagen/kontoen, anonymt efter 48 timer. Tilbagetrækning lukker samtalen og stopper AI (anonymt: hele sessionen slettes). Deles aldrig med klinikker. Indgår i dataeksporten |
| Sag: beskrivelse, mundfotos, AI-opsummering, ydelser | patient | Sende sagen til klinikker, patienten selv vælger | Samtykke: `image_upload`, `health_data_sharing` (med tidspunkt og tekstversion, kan trækkes tilbage) | Til sagen/kontoen slettes eller samtykket trækkes tilbage (billeder slettes, leads trækkes tilbage) |
| Leads, beskeder | patient og klinik | Kontakt om en konkret sag | Samtykke `health_data_sharing` | Følger patientens konto |
| Booking: kontaktnavn, telefon, e-mail | patient → klinik | Klinikken skal kunne kontakte patienten om tiden | Aftale/samtykke | Følger patientens konto. Klinikken ser dem kun for egne bookinger med status `booked`/`completed` |
| Anmeldelser | patient | Verificerede anmeldelser | Aftale | Følger kontoen (moderation [IKKE BYGGET]) |
| Klinikkonto: e-mail, CVR, klinikdata, tandlægers navn/titel/bio/portræt | klinik | Profil, prisliste, leads | Aftale | Ved sletning: filer i `public-media` og auth-bruger slettes; rækkerne ryddes af triggeren (5.3). Importeret klinik: kun offentlige grunddata bevares. Selvoprettet: `removed`, kun navn og adresse bevares, så patienternes historik har en klinik at pege på |
| Porteføljebilleder (før/efter) | klinik | Vise klinikkens arbejde | Klinikkens erklæring om patientens skriftlige samtykke (version og tidspunkt gemmes); klinikken er dataansvarlig | Til klinikken sletter dem eller kontoen |
| Importerede klinikdata (fx CVR) | offentlige erhvervsdata, kan indeholde tandlægens navn | Klinikoversigt | Legitim interesse | Fjernes på anmodning (admin). Kilden skal stå i privatlivspolitikken |
| Rate limits | alle | Misbrugsværn | Legitim interesse | IP gemmes kun som SHA-256-hash; nøgle pr. time |

## AI-chat og billeder (trin 3)

- **Samtykker:** `ai_processing` tjekkes server-side før hver chat-tur og hver opsummering. `image_upload` (nyeste tekstversion med AI-oplysning) tjekkes før upload (controller og databasetrigger) og igen, før billeder sendes til OpenAI. Tilbagetrækning af `image_upload` sletter filer og rækker; af `ai_processing` lukker samtalen.
- **Billeder:** privat bucket `case-images` uden storage-policies for `anon`/`authenticated`. Filen læses først efter ejer-, kladde-, samtykke- og antalstjek; magic bytes (JPEG/PNG/HEIC), max 4 MB, `sharp` re-encoder til JPEG uden EXIF (max 50 MP input). Sti `{case_id}/{image_id}.jpg`. Visning kun via signerede URL'er à 5 min, som ikke logges. Max 5 pr. sag; anonyme max 20 MB.
- **Til OpenAI:** maskeret patienttekst i `<patient_input>` (escapet), katalogets slugs/navne, billeder som re-encodet base64 (low detail, max 1024 px), billedreferencer `img_n`. Aldrig navn, e-mail, telefon, postnummer, id'er, signerede URL'er, priser eller klinikdata. Patientens tekst maskeres (e-mail, CPR, telefon, vejnavn med husnummer, postnummer med by, navneudsagn som "jeg hedder ..."), før den gemmes og igen i prompten; maskeret tekst bliver aldrig længere end originalen. Navne og adresser uden disse mønstre når stadig OpenAI (kendt begrænsning, kompromis 9).
- **Service role** bruges kun til `append_assistant_message`, `store_ai_summary`, `try_consume_anonymous_ai_call` (bruger-id fra den verificerede session, aldrig fra klienten), billedfiler/-rækker, AI-billedbeskrivelser og signering, altid efter ejertjek med brugerens JWT.
- **Testklient:** `AI_FAKE_CLIENT=1` virker kun, når `NODE_ENV !== 'production'`, og kan ikke slås til via en request.
- **Lofter (7.6):** hver chat-tur reserveres i databasen før modelkaldet (`reserve_chat_turn()`, advisory-lås pr. patient): 30 pr. samtale, 100 brugerbeskeder pr. patient pr. døgn, 40 AI-kald pr. anonym bruger pr. døgn og 300 anonyme kald i alt pr. døgn. Testet med 60 samtidige kald: præcis 30 gik igennem. Fejler modellen, er turen brugt (fast svar gemmes). IP-grænser: chat 120/t, opsummering 20/t, upload 10/t; upload uden `Content-Length` afvises (411).
- **Billedbeskrivelser til klinikken:** `ai_description` vises kun i `clinic_lead_images()`, når patienten har godkendt opsummeringen efter beskrivelsen blev skrevet (`summary_approved_at >= ai_described_at`). Gamle rækker uden tidsstempel er skjulte (fail closed).
- **Logs:** kun fejltype; aldrig beskeder, svar, billeder eller URL'er.

## Leads (trin 4)

- **Afsendelse** sker kun via `send_leads()` (security definer): kræver permanent konto, ejerskab af sagen, aktivt `health_data_sharing`, godkendt opsummering, verificerede klinikker og lofterne 3 aktive / 10 i alt pr. sag. Routen tjekker desuden konto (403 `ACCOUNT_REQUIRED`) og sagens ejer (404).
- **Klinikkens navn til patienten** kommer fra `patient_lead_clinics()` (security definer, kun `authenticated`): kun navn, by, logo og `removed` for klinikker på patientens **egne** leads (`cases.patient_id = auth.uid()`). Ingen kontakt, CVR, ejer eller adresse. RLS-test 42.
- **Tilbagetrækning** via `withdraw_lead()`, som selv tjekker sagens ejer; et fremmed lead giver 404.
- **Klientlagring:** valget af klinikker gemmes i `sessionStorage` (kun klinik-id og -navn). URL'erne indeholder sags-id, klinik-id'er, behandlings-slugs og postnummer, men ingen fritekst, opsummering eller billeder. `Referrer-Policy: strict-origin-when-cross-origin` sender kun origin til eksterne sider.
- **Rate limit:** IP-grænse 30/time på afsendelsen af leads (architecture 10.5); lofterne pr. sag og døgnloftet pr. patient står i databasen. Se kompromis 12.

## Klinikkens indbakke og beskeder (trin 5)

- **Læsning:** klinikken læser leads, detaljer, billeder og beskeder kun via `clinic_leads()`, `clinic_lead_detail()`, `clinic_lead_images()` og `clinic_lead_messages()` (security definer, `search_path = ''`, ejer + `verified` + `sent_at >= owner_since`). Ingen af dem returnerer `patient_id`, `sender_id` eller `case_id`. Tilbagetrukne leads giver kun id, status, `sent_at` og `withdrawn_at`; ingen billeder eller beskeder. Kontaktfelter kun ved effektiv booking-status `booked`/`completed`. Controlleren kræver desuden `verified` (403 `CLINIC_NOT_VERIFIED`); fremmed lead giver 404. RLS-test 01-05, 27-29 og 44.
- **Billeder til klinikken:** stierne kommer kun fra `clinic_lead_images()` for det konkrete lead (aktivt `image_upload`-samtykke, ikke kladde, ikke tilbagetrukket) og signeres på serveren med service role à 5 min. Billedbeskrivelsen kun efter patientens godkendelse. Den signerede URL indeholder stien `{case_id}/{image_id}.jpg`.
- **Beskeder:** `sender_role` (`patient`/`clinic`) sættes af en security definer-trigger ud fra, om afsenderen er sagens patient; en afvigende værdi afvises (`SENDER_ROLE_MISMATCH`), og rollen kan ikke ændres. Klinikkens beskeder bevares med `sender_id = null`, når klinikkontoen slettes. Insert kræver deltager, permanent konto, åben tråd (`sent`/`accepted`/`booked`) og højst 200 beskeder pr. døgn (RLS). Brødtekst vises som ren tekst (ingen HTML).
- **Rate limit:** beslutning kan kun træffes én gang pr. lead (`sent` → 409); beskeder har døgnloftet 200 i databasen. Ingen IP-grænse på GET-routerne (polling hvert 15. sekund).

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
9. **PII-maskering er regex-baseret** (forbedret i 3.6a: e-mail, telefon, CPR, vejnavn + husnummer, postnummer + by, navneudsagn). Navne og adresser uden disse mønstre når stadig OpenAI. Mundfotos kan vise dele af ansigtet. Maskeringen overmaskerer af og til (fx "bor på Nørrebrogade 12" bliver til "[fjernet]").
10. ~~Lofterne for chat tælles først efter modelkaldet~~ **Løst i 3.6b** (migration `20261019000100`, `reserve_chat_turn()`). Tilbage står: døgnloftet pr. patient tælles ud fra `ai_messages` og nulstilles, når patienten sletter kladden; de anonyme lofter kan forbruges direkte via PostgREST uden IP-grænse (10 anonyme konti/t pr. IP x 40 kald > globalt loft 300), så det globale anonyme loft kan tømmes (tilgængelighed, ikke datalæk). Se security-rapport 3.6d M1-M2.
11. **Patienten kan stadig indsætte egne brugerbeskeder direkte** i `ai_messages` (policy `ai_messages_insert_own_user`) uden om `reserve_chat_turn()` og maskeringen ved gemning. Giver ingen modelkald; historikken maskeres igen i prompten. Bør fjernes (3.6d L1).
12. ~~Intet loft på leads pr. patient~~ **Løst i trin 4** (migration `20261022000100`, trigger `leads_daily_limit`): højst 15 leads pr. patient pr. løbende døgn (429 `LEAD_DAILY_LIMIT`) og IP-grænse 30/time på afsendelsen.
13. **Klinikken har direkte SELECT på hele `leads`-rækken** (policy `leads_select_case_owner_or_clinic`). Via PostgREST kan klinikken derfor læse `case_id`, `distance_km`, listepris, `requested_service_id` og `requested_starts_at` også for et **tilbagetrukket** lead, selvom `clinic_*`-funktionerne skjuler dem (4.4, 5.7). Ingen patientidentitet, men i strid med reglen for tilbagetrukne leads, og `case_id` lader to klinikker se, at de har fået samme sag. Security-rapport trin 5, H1: fjern klinikkens gren af policyen i en ny migration og lad klinikkens statusopslag gå via en funktion.
14. **Patienten kan læse `messages.sender_id`** og dermed klinikejerens bruger-id (5.1: `owner_id` returneres aldrig). Ingen kontaktdata; bør skjules med kolonne-grant eller view (trin 5, L1).
15. **Fritekst i beskeder filtreres ikke:** patient og klinik kan udveksle telefon/e-mail i tråden før booking. Produktregel ("al kontakt går gennem platformen"), ikke databaseregel.
