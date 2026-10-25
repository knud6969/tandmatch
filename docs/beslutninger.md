# Status, risici og beslutninger

Prototype-status, demo-scope, byggetrin, risici og åbne/låste beslutninger. Afsnittene nedenfor er flyttet uændret fra `docs/architecture.md` (oversigten). Numrene er bevaret, så henvisninger som "architecture 10.10" i koden stadig kan findes. Stier er opdateret til den nye struktur.

## 0. Sådan bruges dokumentet

### 0.1 Prototype-status

TandMatch er en **prototype** til fremvisning. Alt kan ændres senere, men følgende må ikke gå på kompromis selv i prototypen: klinikker ser aldrig hinandens leads, svar, bookinger eller patienter (RLS); klinikken ser ikke patientens identitet før accepteret lead og booket tid; AI'en nævner aldrig priser og anbefaler aldrig en klinik; samtykke før AI-behandling, billedupload og deling; helbredsdata er aldrig offentligt tilgængelige.

Bevidste prototype-kompromiser [PROTOTYPE]:

| Kompromis | Hvorfor | Hvad en rigtig løsning kræver |
|---|---|---|
| Klinikker auto-verificeres ved oprettelse (`prototype_auto_verify_clinics()`, 12.2); ingen verificeringsflow og ingen adminside | Prototypen skal kun vise, at web og app spiller sammen | Verifikationsflow (CVR, autorisation) og adminside; slå auto-verificering fra med en ny migration |
| Importerede klinikker kommer fra seed-data | Importkilde ikke valgt | Import fra CVR eller andet register (12.3) |
| En klinik, der opretter sig med et CVR-nummer, som en importeret klinik har, overtager den importerede række uden bevis for ejerskab | Enkelt demoflow | Bevis for ejerskab før overtagelse. Værnet i dag: den overtagne klinik er usynlig offentligt og kan ikke modtage leads, før admin har verificeret ejeren (12.1) |
| Én kalender pr. klinik: kun én booking ad gangen | Enkel dobbeltbookingsregel | Kalender pr. behandler eller stol (12.3) |
| Ingen e-mailbekræftelse ved kontooprettelse | Enkelt demoflow | Slå e-mailbekræftelse til i Supabase |
| Ingen CAPTCHA på anonyme sessioner; kun rate limits og lofter | Enkelt demoflow | Cloudflare Turnstile |
| En patient med eksisterende konto kan ikke overtage en anonym samtale ved login (kun ny konto) | Undgår flytning af data mellem brugere | Sikker overtagelse via service role (7.7) |
| Oprydning af anonyme sessioner og `complete_due_bookings()` køres af planlagt job eller manuelt; i demoen kører ingen cron (appen kører lokalt, 2.3) | Ingen hosting i demoen | Hosting med fast planlagt job |
| Polling i stedet for realtime | Enkelhed | Supabase Realtime |
| CSP tillader `'unsafe-inline'` for scripts/styles | Next.js' inline-scripts uden nonce-opsætning | Nonce-baseret CSP via `proxy.ts` (2.4) |
| Signerede billed-URL'er til klinikken indeholder `case_id` i stien (security trin 5, M1) | Ingen patientidentitet; enkel lagring | Sti uden sags-id med opslag i `case_images` (4.4, 9.2) |
| Patienten kan sætte `read_at` på klinikkens beskeder til en vilkårlig værdi (security trin 5, L2) | Påvirker kun visningen | Funktion i stedet for direkte update |
| Ingen IP-grænse på klinikkens GET-routes for leads og beskeder (security trin 5, L3) | Polling hvert 15. sekund; ingen datalæk | Rate limit pr. bruger på GET |
| Kortfliser hentes fra OpenStreetMaps offentlige server | Gratis og enkelt | Egen eller betalt fliseudbyder (OSM's brugspolitik) |
| Brugervilkår, privatlivspolitik og samtykketekster er pladsholdere (`v0-prototype`, delingssamtykket `v1-klinikker`) | Juridisk tekst ikke skrevet | Skrevne og gennemgåede tekster (12.4) |
| Sletning af en patientkonto sletter også patientens leads, kommende bookinger og anmeldelser hos klinikkerne (cascade) | Enkel og fuldstændig sletning | Aflysning af kommende tider og anonymisering af anmeldelser (12.3 punkt 35) |
| Akutteksterne nævner kun Akuttelefonen 1813, som gælder i Region Hovedstaden; for andre regioner står der "lægevagten i din region" uden nummer (`lib/leads/constants/emergency.ts`, 6.1) | Demoen foregår i Storkøbenhavn | Nummer pr. region ud fra patientens postnummer, gennemgået af en fagperson (12.3 punkt 36) |
| Mobilappen køres kun i Expo Go på iPhone og i iOS-simulatoren mod Next.js-serveren på udviklerens computer (LAN); ingen app store-build, ingen hosting (13.8) | Afleveringen er kildekode og live demo på telefon | EAS-build, TestFlight/App Store, hostet API med HTTPS |
| Appens tokens (access, refresh og vilkårstoken) ligger i `expo-secure-store` på telefonen; ingen biometri, ingen tilbagekaldelse ud over Supabase' refresh-rotation (13.3) | Enkelt og tilstrækkeligt til demo | Gennemgang af token-levetid, tilbagekaldelse ved mistet telefon, evt. biometrisk lås |
| Patientsiderne på weben (6.1 `/start`, `/akut`, 6.2 `/patient/*`) er sat på pause: de findes og testes, men følger ikke længere med appen og har kendte småfejl fra review 7.11 (13.6) | Patienterne bruger appen | Fjernes, når appen er i brug (12.3 punkt 38) |

## 1. Overblik og principper

### 1.1 Demo-scope

| I demoen | [UDSKUDT] |
|---|---|
| Vilkårs-gate, login, roller (patient, klinik), navigation, design (hvid og blå) | Streaming af AI-svar, realtime, notifikationer (e-mail/SMS, push i appen) |
| Ydelseskatalog, klinikprofil med prisliste, åbningstider, tandlæger og portefølje (klinik-web) | Adminside til verifikation af klinikker og import |
| Patient-appen (13): forside, klinikoversigt med liste, kort (Apple Maps via `react-native-maps`) og filtre, klinikprofil | Rigtig import af klinikker fra CVR |
| AI-chat med billeder, forslag til ydelser, foreløbig vurdering, akut-henvisning, opsummering (i appen) | Kalender pr. behandler, synkronisering med klinikkens eget bookingsystem |
| Sammenligning og leads til op til 3 klinikker (i appen) | Udløb og påmindelser for ubesvarede leads ([ÅBEN] 12.3) |
| Lead-indbakke: accepter, accepter med kommentar, afvis (klinik-web) | CAPTCHA, e-mailbekræftelse |
| Booking i klinikkens kalender, aflysning, automatisk gennemførelse, markering af udeblivelse | Opbevaringsperiode for kontodata |
| Anmeldelser efter gennemført booking, prisnøjagtighed, klinikkens svar | Endelige vilkår, MDR-vurdering, databehandleraftaler |
| Akutvej, beskedtråd pr. lead, samtykker, demodata | Android, app store-build, dybe links fra e-mail, dataeksport i appen (findes på weben og i API'et) |

## 11. Byggetrin og status

Start på omlægningen 2026-10-12. Hvert trin afsluttes med reviewer og tester; security køres ved ændringer i login, databaseregler og billeder, før merge til main og før demo. Opgaverne pr. trin står i `docs/arbejdsplan.md`.

| Trin | Indhold | Status |
|---|---|---|
| 0 Database og oprydning | Nyt samlet migrationssæt (nedenfor), `supabase/config.toml`, `seed.sql`, nyt seed-script, RLS- og API-tests, fjernelse af den gamle domænekode, kernen som klasser (12.5) | Bygget (0.1-0.11 committet på `feat/omlaegning-trin-0`). 0.8 (nulstilling af det fælles projekt) udføres manuelt af brugeren |
| 1 | Ydelseskatalog, klinikprofil med prisliste, åbningstider og tandlæger (inkl. klinik-signup, rollen `clinic`, `/klinik`) | Bygget og afsluttet på `feat/omlaegning-trin-1` (sidste commit `623314f4`). Ingen åbne kritiske fund. Tests: RLS 36, API 82, unit 6, e2e 6; klinikrejsen 40 af 40 gentagelser uden logud-fejl. Mangler: HSTS tjekket i en produktionsbuild, og migration `20261016000200` køres i det fælles projekt |
| 2 | Forside, klinikoversigt med kort, filtre og klinikprofil | Bygget og afsluttet på `feat/omlaegning-trin-2` (sidste commit `98c6a022`; 2.1-2.6 i `4ec5b70e`, `6286c8ed`, `a3f8d47b`, `ea70980b`; 2.8 rettelser efter review). Tests: RLS 36, API 112, unit 54, e2e 16 (begge viewports), gentagelser 40/40 uden ustabilitet, ingen CSP-fejl. `tests/e2e/run.sh` kører `npm run seed:demo` før Playwright (spring over med `E2E_SKIP_SEED=1`). Mangler: migrationerne `20261016000200` og `20261017000100` køres i det fælles projekt. Forsidens `ClinicPreview` er stadig illustrationer, ikke rigtige klinikker |
| 3 | AI-chat med billeder, forslag til ydelser og opsummering | I gang på `feat/omlaegning-trin-3`: 3.1-3.4 bygget (`dbdd3881` AI-regler, `ba7115b2` sager og billeder, `adf9c53c` chat og opsummering, sagsflowets sider); 3.5 review og security gennemført; 3.6 bygget (`b2f2aff8`, `df541715`, `88995a2b`, `4649015d`) og fulgt op af reviewer og security; 3.7a-c bygget (`7c0b24f4` AI-filtre, 3.7b backend; 3.7c var allerede dækket af `4649015d`); 3.7d (tester) er i gang |
| 4 | Sammenligning og leads til op til 3 klinikker | Bygget og afsluttet på `feat/omlaegning-trin-4` (sidste commit `7c6c0d0e`). Tests: RLS 41, API 188, unit 384, e2e 28 |
| 5 | Klinikkens indbakke: accepter eller afvis | Bygget og afsluttet på `feat/omlaegning-trin-5` (sidste commit `95427c61`). Tests: RLS 44, API 207, unit 397, e2e 62 |
| 6 | Booking i klinikkens kalender og anmeldelser efter besøget | Færdigt på `feat/omlaegning-trin-6` (6.1-6.5, kontrol 6.6, rettelser 6.7a-d; sidste commit `af065eb5`). Tests: RLS 46, API 249, unit 436, e2e 108 |
| 7 | Akutvej, demodata og finpudsning | Bygget på `feat/omlaegning-trin-7` (fra `7a81a257`): 7.1-7.10, 7.15 og 7.16; slutkontrol 7.11 (sidste commit `68ec8360`) uden kritiske eller høje fund. Rettelserne 7.12a-b (kun backend og `lib/`: migration `20261028000500`, samtykketjek ét sted, akuttekster og andre delte tekster i `lib/<domæne>/constants/`, ét sletteskema) er bygget; derefter demo-tjeklisten 7.13. UI-rettelserne fra slutkontrollen for patientsiderne på weben bortfalder (siderne er sat på pause, 13.6). Opgaverne står i `docs/arbejdsplan.md` |
| 8 | Mobilapp til patienter (13) | I gang (resten [IKKE BYGGET]). Planlagt 2026-10-19 på `feat/trin-8-mobilapp` (fra trin 7 efter 7.12); afleveres ca. 2026-10-26. Backend: bearer-auth, vilkårstoken og `POST /api/auth/refresh` (8.1, bygget), delte fejltekster i `lib/` (8.2); appen i `mobile/` (8.3-8.12). Opgaverne og hvad der skal med til afleveringen står i `docs/arbejdsplan.md` |
| Infrastruktur | Vilkårs-gate, MVC-lag med ESLint og klasser (2.1.1), auth, anonym session, samtykker, billedbehandling, UI-komponenter | Bygget |

**Migrationer:** det gamle sæt (27 filer) er slettet fra koden og erstattet af det samlede sæt nedenfor (bygget i trin 0). Det fælles Supabase-projekt er nulstillet og kører det nye sæt (0.8, udført 2026-10-12; tjek i 2.3.1). Der er nu 38 migrationer: de 12 i det samlede sæt, `20261013000100`, fem `20261014`-filer, to `20261015`-filer, to `20261016`-filer (securitys rettelser), `20261017000100` (trin 2), `20261018000100`, to `20261019`-filer og `20261020000100` (trin 3), `20261021000100`, `20261022000100` (trin 4), `20261023000100`, `20261024000100` og `20261025000100` (trin 5), `20261026000100` og `20261027000100` (trin 6) og `20261028000100`-`000400` (trin 7). 7.12a tilføjer den 39., `20261028000500`. De første 33 er kørt i det fælles projekt (senest `20261026000100` den 2026-10-18; brugeren kører dem). **`20261027000100` og alle trin 7-filerne er ikke kørt i det fælles projekt endnu**; brugeren kører dem med `supabase db push` før demoen (`docs/arbejdsplan.md` 7.13). Nye ændringer kommer som nye filer (2.6). Alle filer til og med `20261028000400` er låst og ændres ikke. Sættet:

| Fil | Indhold |
|---|---|
| `20261012000000_extensions_enums.sql` | `btree_gist`, alle enums (4.2) |
| `20261012000100_profiles_terms_consents.sql` | `profiles`, `patients`, `terms_acceptances`, `consent_text_versions`, `consents`, `postal_codes`, hjælpefunktioner uden domæneafhængighed |
| `20261012000200_services_catalog.sql` | `services` + startkatalog |
| `20261012000300_clinics.sql` | `clinics`, `clinic_prices`, `clinic_opening_hours`, `clinic_time_blocks`, `clinic_dentists`, `portfolio_items`, `clinics_guard()`, `admin_set_clinic_status()` |
| `20261012000400_auth_triggers.sql` | `handle_new_user()` (patient, klinik, anonym, CVR-tilknytning, metadata som i 4.3), `is_cvr_claimed()`, `is_anonymous`-spejl |
| `20261012000500_cases_ai.sql` | `cases`, `case_services`, `ai_conversations`, `ai_messages`, AI-lofter og -funktioner (inkl. `try_consume_anonymous_ai_call(p_user_id)`) |
| `20261012000600_case_images_storage.sql` | `case_images`, buckets `case-images` og `public-media`, storage-regler |
| `20261012000700_leads_messages.sql` | `leads`, `messages`, `clinic_mark_lead_seen()`. `send_leads()`, `clinic_decide_lead()` og `withdraw_lead()` ligger i bookingfilen, fordi de opretter og ændrer `held`-bookinger |
| `20261012000800_bookings.sql` | `bookings`, udelukkelse (inkl. `held`), check for helt kvarter, `effective_booking_status()`, `assert_slot_bookable()`, `service_duration_min()`, `release_expired_holds()`, `send_leads()`, `clinic_decide_lead()`, `withdraw_lead()`, `close_case()`, `clinics_after_owner_removed()`, `book_slot()`, `cancel_booking()`, `mark_booking_no_show()`, `complete_due_bookings()` |
| `20261012000900_reviews.sql` | `reviews`, `review_replies`, statistik |
| `20261012001000_read_functions.sql` | `clinic_*` (inkl. `clinic_lead_messages()`, `clinic_mark_messages_read()`) og `public_*` (5.3, 5.7) |
| `20261012001100_consent_withdrawal_cleanup.sql` | `withdraw_consent()`, `confirm_consent_cleanup()`, `touch_last_active()`, `consume_rate_limit()` |
| `20261013000100_dentist_photo_version.sql` | `clinic_dentists.photo_updated_at` (versioneret portræt-URL, 9.5) |
| `20261014000100_service_groups.sql` | `service_groups` + startkategorier, `services.group_id` (eksisterende behandlinger placeres, nye indsættes efter `docs/behandlingskatalog.md`), type-check for `akut` |
| `20261014000200_clinic_service_groups.sql` | `clinic_service_groups`, trigger på `clinic_prices` (valgt kategori), `set_clinic_service_groups()`, `replace_clinic_prices()`, `replace_opening_hours()`, `clinics.logo_updated_at` |
| `20261014000300_public_visibility.sql` | `create or replace` af `public_*`: kun `verified` og `imported` uden ejer; kategori pr. behandling |
| `20261014000400_clinic_owner_removed.sql` | ny version af `clinics_after_owner_removed()` med rækkeoprydningen (inkl. e-mail, website og valgte kategorier); selvoprettede klinikker behandles midlertidigt som importerede |
| `20261014000500_clinic_hardening.sql` | kolonne-grants på `clinic_dentists`, check på `clinics.website`, lofter i databasen (tandlæger, portefølje, åbningsvinduer, blokeringer) |
| `20261015000100_clinic_status_removed.sql` | `alter type public.clinic_status add value 'removed'`. Egen fil, fordi en ny enum-værdi ikke må bruges i samme transaktion, som den tilføjes i |
| `20261015000200_clinic_removed.sql` | check `clinics_status_owner_check` (4.3); `clinics_guard()` sætter `removed`/`imported` og rydder klinikrækkens felter, når ejeren fjernes, og afviser ændringer af en `removed` klinik; `clinics_after_owner_removed()` rydder rækker i andre tabeller (gren (b) også åbningstider); `handle_new_user()`/`is_cvr_claimed()` (CVR-tilknytning kun til `imported` uden ejer); `public_clinics()` udelukker `removed` eksplicit; ny trigger `leads_clinic_guard()` afviser leads til en `removed` klinik (5.3) |
| `20261016000100_clinic_import_snapshot.sql` | `clinic_import_snapshots` (RLS uden policies); `handle_new_user()` gemmer snapshot ved CVR-overtagelse; `clinics_guard()` og `clinics_after_owner_removed()` gendanner grunddata og åbningstider for en ikke-verificeret ejer og sletter snapshottet (4.3) |
| `20261016000200_services_active_groups.sql` | Policyen på `services` skjuler også behandlinger i en inaktiv kategori (5.4, RLS-test 38). |
| `20261017000100_public_reviews_created_at.sql` | `public_reviews()` returnerer `created_at` i stedet for `created_month`; måneden beregnes i TypeScript (10.13). |
| `20261018000100_ai_reply_after_message_cap.sql` | `append_assistant_message()` accepterer et svar i en lukket samtale, hvis den seneste besked er patientens (svaret på den 30. besked, 5.3). |
| `20261019000100_reserve_chat_turn.sql` | første version af `reserve_chat_turn` (kaldt med patientens JWT; signaturen og rettighederne er ændret i `20261020000100`), tabel `ai_anon_user_usage_daily`, `ai_limits.anon_user_daily_ai_calls` (40) og `chat_messages_per_patient_day`, intern `consume_anonymous_ai_call()`; strammere `append_assistant_message()` (aktivt `ai_processing`, kladde, lukket samtale kun ved loftet på 30). |
| `20261019000200_image_description_sharing.sql` | `case_images.ai_described_at` (trigger); `clinic_lead_images()` returnerer `ai_description` kun efter patientens godkendelse (fail closed); `approve_summary(uuid, text, boolean default null)` sætter `summary_ai_assisted` (false uden AI-udkast). |
| `20261020000100_ai_calls_service_role_only.sql` | `reserve_chat_turn(p_user_id, p_conversation_id, p_content)` og `consume_summary_generation(p_user_id, p_case_id)` kun for service role (tjekker selv ejer, kladde og samtykke; opsummering forbruger anonymes eget døgnloft); `ai_patient_usage_daily.chat_messages` (UTC-dag) erstatter det rullende døgn; `patient_user_messages_last_day()` og policyen `ai_messages_insert_own_user` droppet; nye `ai_limits`-nøgler `chat_messages_per_conversation` og `chat_message_max_chars` (5.3, 5.4, 7.6). |
| `20261021000100_patient_lead_clinics.sql` | `patient_lead_clinics(p_case_id default null)`: navn, by, logo og `removed` for klinikker på patientens egne leads (security definer, kun `authenticated`; 10.9). |
| `20261022000100_leads_daily_limit.sql` | Trigger `leads_daily_limit()`: højst 15 leads pr. patient på 24 timer (7.6, security trin 4). |
| `20261023000100_messages_sender_role.sql` | `messages.sender_id` nullable med `on delete set null`, enum `message_sender_role` og kolonne `sender_role` (udledt af trigger), opdateret update-policy, `clinic_leads()`, `clinic_lead_messages()` og `clinic_mark_messages_read()` bruger `sender_role` (12.3 punkt 30). |
| `20261024000100_clinic_lead_access.sql` | Policyen på `leads` erstattes af `leads_select_case_owner` (kun sagens ejer); ny `clinic_lead_status(p_lead_id)`; kolonne-grant på `messages` uden `sender_id`; `clinic_leads()` tæller kun billeder med aktivt `image_upload`-samtykke i `image_count`, ligesom `clinic_lead_images()` (security trin 5 H1 og L1, review 5). |
| `20261025000100_clinic_lead_detail_unread.sql` | `clinic_lead_detail()` returnerer `unread_messages`, og dens `image_count` tæller kun billeder med aktivt `image_upload`-samtykke som `clinic_leads()` (security 5.5d L1); `clinic_leads()` sorterer kun på akut for leads, der ikke er trukket tilbage (review 5.5c). |
| `20261026000100_booking_reads.sql` | `patient_bookings(p_booking_id default null)` (patientens egne bookinger med klinikkens navn, adresse og by, `reviewed`, `created_at`; effektiv status) og `clinic_booking(p_booking_id)` (én af klinikkens bookinger, samme kontaktregel som `clinic_bookings()`). (6.1). |
| `20261027000100_booking_limit.sql` | `create or replace` af `book_slot()`: afviser den 6. booking på samme lead (alle statusser tælles, også aflyste) med `BOOKING_LIMIT` (409), efter `LEAD_NOT_ACCEPTED`/`CLINIC_NOT_AVAILABLE`. Ellers uændret (signatur, security definer, `search_path = ''`, tjek og grants). Security trin 6, M1 (6.7a). **Ikke kørt i det fælles projekt endnu.** |
| `20261028000100_phone_digits_booking_limit.sql` | (bygget i 7.1) `is_valid_phone()` (5.3); `patients.phone`, der ikke overholder reglen, sættes til `null` (feltet er kun et forslag), hvorefter check constraints på `patients.phone`, `clinics.phone` og `bookings.contact_phone` erstattes af `is_valid_phone()`. For `clinics` og `bookings` tilføjes de nye constraints `not valid` og valideres i en `do`-blok; fejler valideringen (gamle rækker), bliver de stående som `not valid` (gælder for nye og ændrede rækker), og migrationen skriver en `notice`. `create or replace` af `book_slot()` fra `20261027000100`: telefon via `is_valid_phone()`, og `BOOKING_LIMIT` tæller ikke bookinger med `cancelled_by = 'clinic'`. Ellers uændret (signatur, security definer, `search_path = ''`, grants). Security kompromis 20 og 23 |
| `20261028000200_sharing_consent_v1.sql` | (bygget i 7.2) Ny række i `consent_text_versions`: `('health_data_sharing', 'health_data_sharing@v1-klinikker', false)` (4.3) |
| `20261028000300_send_emergency_lead.sql` | (bygget i 7.3) `send_emergency_lead()` (5.3, 10.11): security definer, `search_path = ''`, kun `authenticated` |
| `20261028000400_postal_codes_dk.sql` | (bygget i 7.15) Kun data: alle danske postnumre fra `supabase/data/postal-codes.csv` (GeoNames, CC BY 4.0; kilde og hentedato i filens hoved) i `postal_codes`, `on conflict (postal_code) do update set city, lat, lng` (idempotent). Ingen skema-, RLS- eller grant-ændringer (4.3). Scriptet skriver aldrig igen til denne fil (2.2) |
| `20261028000500_retired_consent_versions.sql` | Bygget (7.12a; security 7.11 M1 og M2). `alter table consent_text_versions add column retired_at timestamptz null`; `retired_at = now()` på `health_data_sharing@v0-prototype`; `create or replace` af `is_allowed_consent_text()` (kun ikke-pensionerede) og `has_active_consent()` (seneste række ikke trukket tilbage og version ikke pensioneret) med uændrede signaturer, `security definer`, `search_path = ''` og grants; `create or replace` af `withdraw_consent()` (kopi af `20261012001100` med tilbagetrækning af alle aktive samtykker af typen og altid `withdraw_open_leads()` ved `health_data_sharing`). `send_leads()` og `send_emergency_lead()` ændres ikke. Eksisterende samtykkerækker ændres ikke (4.3) |

**Nedskæring** hvis tiden ikke slår til, i denne rækkefølge: portefølje → klinikkens svar på anmeldelser → beskedtråd → kort (listen er nok) → akutvindue (akutvejen bruger almindelige tider). Skæres **aldrig**: isolation af leads og skjulte kontaktoplysninger (RLS), samtykke før chat/upload/deling, AI-reglerne (ingen priser, ingen klinikanbefaling, akut-henvisning), maks. 3 leads, ingen dobbeltbooking, "Slet min samtale" og oprydning af anonyme data.

---

## 12. Risici, åbne og udskudte beslutninger

### 12.1 Kendte risici

| Risiko | Konsekvens | Afbødning |
|---|---|---|
| Fejl i RLS eller en læsefunktion (fx en ekstra SELECT-policy på `leads` eller `bookings`) | Klinikker ser hinandens leads eller patientdata | Klinikker læser kun via `clinic_*`; tests 1-5 i 5.6; security før merge |
| Ny ejer af en klinik (CVR-overtagelse) ser den tidligere ejers leads, tråde eller patienter | Brud på isolationen | `clinics.owner_since`; klinikadgang kræver `sent_at >= owner_since` og verificeret klinik; test 27 |
| Klinik læser beskeder direkte og får `sender_id` (patientens bruger-id) | Patientidentitet lækker | Ingen klient-SELECT på `messages` for klinikker; `clinic_lead_messages()` uden `sender_id`; test 28 |
| Gamle storage-policies eller buckets bliver liggende i det fælles projekt efter nulstilling | Uventet adgang til filer | Tjek efter 0.8 (2.3.1) |
| Kontaktoplysninger lækker før booking (fx via beskedtråd, DTO, logs eller en join) | Brud på princip 4 | Kontakt kun i `bookings.contact_*`; ingen klient-SELECT på `bookings`; test 5; reviewer tjekker DTO'er |
| Overtagelse af importeret klinik via CVR uden bevis for ejerskab [PROTOTYPE] | Uvedkommende får kontrol over en rigtig kliniks række og kan blokere den rigtige ejers oprettelse (`CLINIC_EXISTS`) | En overtaget klinik er `registered` og dermed usynlig offentligt, indtil admin har verificeret ejeren, så ændringer aldrig når patienter; `cvr` kan ikke ændres; leads kræver verifikation; ejeren af en fejlagtig overtagelse kan fjernes af admin, og så gendannes grunddata og åbningstider fra `clinic_import_snapshots` (4.3), så en uverificeret ejers ændringer aldrig bliver offentlige. Restrisiko: klinikker, der blev overtaget før migrationen `20261016000100`, har intet snapshot. Bevis for ejerskab før overtagelse afklares før rigtige brugere (12.3 punkt 6) |
| Foreløbig vurdering og forklaring af behandlinger | Kan gøre produktet til medicinsk udstyr (MDR) | Fast mærkat, ingen endelige diagnoser, regler samlet i `rules.ts`, faglig vurdering før rigtige patienter (12.4) |
| AI'en nævner priser eller klinikker | Brud på kerneprincip, vildledning | AI'en får ingen pris- eller klinikdata; skema uden felter; filter; provokationstests |
| Akutte tegn overses af AI'en | Patientsikkerhed | Fast akut-indgang på forsiden og i chatten uafhængigt af AI'en; tests med akutte symptomer |
| Porteføljebilleder uden gyldigt samtykke | GDPR art. 9, klinikkens ansvar men vores platform | Bekræftelse med tekstversion og tidspunkt; ingen ansigter; juridisk afklaring (12.4) |
| Ustabilt logout lige efter en gemning (fundet i 1.8: ca. 2 af 10 e2e-kørsler gav 401 efter "Gem profil" og genindlæsning) | Klinikken blev sendt til login | **Rettet i 1.9:** hver request opretter nu kun én auth-kontekst (`createAuthContext()`/`requireTerms()`), som routen giver videre, så sessionen kun verificeres og evt. fornyes ét sted pr. request i stedet for i flere klienter samtidig (refresh token rotation). Midlertidige Auth-fejl (`isTransientAuthError()`) giver 503 `AUTH_UNAVAILABLE` og aldrig 401 eller redirect til login (2.4). Restrisiko: nye routes, der opretter deres egen klient, genintroducerer fejlen; reviewer tjekker 2.1-mønstret |
| Mange uploads fra en klinikkonto (logo, portrætter, portefølje) | Lagerplads og CPU (sharp) | IP-rate limit 10 pr. time, lofterne pr. klinik (7.6), maks. filstørrelse, kun permanente klinikkonti |
| Admin ændrer kataloget direkte i databasen | En slettet eller fejlagtigt deaktiveret behandling kan bryde priser og sager | Rækker deaktiveres i stedet for at slettes (FK'er forhindrer sletning); akut-typen håndhæves af trigger; adminside med validering [UDSKUDT] |
| Dobbeltbooking ved samtidige kald | To patienter får samme tid | Udelukkelse i databasen, ikke kun tjek i koden; test 7 |
| Klinikken markerer et besøg som udeblevet for at undgå en anmeldelse | Skæve anmeldelser | `no_show` kan kun sættes inden for 24 timer efter sluttid; tidspunktet gemmes (`no_show_at`) og kan følges op |
| Ubesvarede leads | Patienten venter | Patienten kan trække et ubesvaret lead tilbage og vælge en anden klinik; intet automatisk udløb |
| Mange leads pr. sag over tid (afvis/træk tilbage og send igen) | Spam af klinikker | Samme klinik kan ikke få sagen to gange; højst 10 leads i alt pr. sag |
| Reserveret akuttid uden svar | Tiden er blokeret for andre patienter | Reservationen udløber efter 30 minutter (eller ved starttid), håndhævet i databasen uden cronjob; frigives også ved afvisning og tilbagetrækning |
| Udløb af reservationer afhænger af, at alle skrivende bookingfunktioner kalder `release_expired_holds()` | En udløbet reservation kunne blokere en ny booking | Krav til migrationen; RLS-test 21 |
| Misbrug af anonyme sessioner | Omkostning, lagring | IP-rate limit, lofter, globalt AI-loft, 48 timers sletning; Turnstile [UDSKUDT] |
| Anonyme helbredsdata uden kontoforhold | GDPR art. 9 | Samtykke før session, minimering, 48 timer, slet med ét klik, oprydningsjob |
| Vilkårs-accept forveksles med samtykke | Ugyldigt grundlag | Separate tabeller, API-test (5.6) |
| Service role-funktioner kaldt med forkerte parametre | Skrivning på en andens sag | Funktionerne tager `p_user_id` og tjekker ejerskab og tilstand selv (5.1 regel 8); tests 14-15 |
| Kortfliser fra OSM's offentlige server | Brugspolitik, CSP | [PROTOTYPE]; egen udbyder før drift |
| Prisnøjagtighed på få anmeldelser | Misvisende | Minimum 3 |
| Manuel Trustpilot-score | Vildledning | "Angivet af klinikken" + dato + link, adskilt fra egne anmeldelser |
| Stram tidsplan og stor omlægning | Ufærdige flows ved fremvisning; i en periode kan appen mindre end i dag | Bred før dyb, nedskæringsrækkefølge (11), samlet oprydning af den gamle kode (12.5), så hvert trin bygger på en kerne, der kompilerer |
| Next.js 16 (`proxy.ts`) | Forvirring for agenter | Læs `node_modules/next/dist/docs/` før kode |
| Appen kalder API'et over **http på LAN** under demoen | Tokens og helbredsdata sendes ukrypteret på det lokale netværk | Kun demodata og fiktive personer i demoen [PROTOTYPE]; Expo Go tillader http, en rigtig build kræver HTTPS (hosting, 12.4) |
| IP-rate limit kan omgås lokalt: direkte mod `next start` stoles på en klient-sendt `x-forwarded-for` (`clientIp()`, 2.4) [PROTOTYPE] | En klient kan skifte "IP" pr. kald og komme uden om grænserne for login, signup, anonym session, upload og refresh | Kun relevant uden proxy (demo på LAN); bag Vercel overskriver platformen headeren. Lofterne pr. konto og pr. sag (7.6) gælder stadig. Ingen kodeændring i prototypen; før drift uden Vercel skal `clientIp()` kun stole på en kendt proxy |
| Bearer- og cookie-vejen i `createAuthContext()` kommer til at afvige (fx et tjek, der kun findes i den ene) | Huller i adgangskontrollen for appen | Én funktion afgør transporten; alt efter verifikationen er fælles; API-tests kører de vigtigste adgangstests med begge transporter (8.1) |
| Appen og weben viser forskellige tekster eller regler | Forvirring, forkerte løfter til patienten | Tekster, labels, skemaer og regler kun i `lib/` (2.1, 13.2); reviewer tjekker for kopier i `mobile/` |

### 12.2 Låste beslutninger

| Beslutning | Afsnit |
|---|---|
| Supabase i EU-region | 2.3 |
| MVC-lag med ESLint-håndhævede importregler; `app/` er kun routing | 2.1, 2.2 |
| Klinikken er kontoen; tandlæger er kun visning | 3, 4.3 |
| Klinikstatus `imported` / `registered` / `verified` / `removed`; kun `verified` modtager leads og bookinger; offentligt vises kun `verified` og `imported` uden ejer; `removed` er endelig og skjult overalt | 3, 4.2, 5.1, 6.6 |
| Ydelseskatalog i databasen; prisliste pr. ydelse med interval og varighed | 4.3 |
| Maks. 3 aktive leads pr. sag, valgt af patienten; afviste og tilbagetrukne tæller ikke; konto og delingssamtykke kræves | 4.3, 5.3 |
| Patienten kan trække et ubesvaret lead tilbage; leads udløber ikke | 4.2, 5.3 |
| Beskedtråden er åben fra leadet er sendt; kontaktoplysninger er skjult til booking, derefter ser klinikken navn, telefon og e-mail | 4.3, 4.4 |
| Booking er gennemført automatisk 24 timer efter sluttid, medmindre klinikken inden da har markeret udeblivelse; anmeldelse først derefter | 4.2, 8.1 |
| Akutvejen kræver login; den valgte tid reserveres straks i højst 30 minutter (eller til starttid), bliver en booking ved accept og frigives ved afvisning, tilbagetrækning eller udløb | 4.3, 6.1 |
| Højst 3 aktive og højst 10 leads i alt pr. sag | 4.3, 5.3 |
| Klinikken mister adgang til sagens indhold og tråd, når patienten trækker leadet tilbage | 4.4, 5.7 |
| Lukning af en sag (`close_case()`) og tilbagetrækning af delingssamtykke trækker ubesvarede og ubookede leads tilbage og frigiver reservationer; bookede tider består | 4.2, 5.3 |
| En klinik, der sletter sin konto: åbne leads afvises med `clinic_left`, og fremtidige bookinger aflyses. En importeret klinik bliver `imported`; offentlige grunddata (navn, adresse, postnummer, by, telefon, åbningstider, admin-indtastet Trustpilot) bevares, og alt klinikindtastet indhold slettes. En klinik, der oprettede sig selv, bliver `removed`: skjult overalt, CVR nulstillet, kun navn og adresse bevares; patienternes historik består. Klinikrækker slettes aldrig | 4.2, 5.3, 10.8 |
| Logo og tandlægeportrætter har versionerede URL'er (`?v=`) | 9.5 |
| Bookinger starter på hele kvarterer, håndhævet i databasen (check constraint) | 4.2, 6.7 |
| Klinikkens adgang er tidsafgrænset af `owner_since` og kræver verificeret klinik; klinikker læser beskeder kun via `clinic_lead_messages()` | 4.3, 5.1, 5.7 |
| Patienter sletter ikke sager direkte; kladder slettes af serveren med service role | 5.4, 10.5 |
| Konstanter, som databasen håndhæver, står både i SQL og i `lib/<domæne>/constants/` og ændres samtidig | 7.6 |
| Offentligt vises kun verificerede klinikker (fuldt niveau) og importerede klinikker uden ejer (basisniveau med Trustpilot, uden egne anmeldelser). `registered` er usynlig, også efter CVR-overtagelse | 3, 5.1, 6.6, 8.4 |
| Kontaktoplysninger kun i `bookings`, kun synlige for klinikken ved `booked`/`completed` | 4.4, 5.5 |
| Klinikker læser kun via `clinic_*`-funktioner; offentlige klinikdata kun via `public_*` | 5.1, 5.7 |
| Ingen dobbeltbooking, håndhævet med udelukkelse i databasen; én kalender pr. klinik [PROTOTYPE] | 4.3 |
| Anmeldelse kun efter gennemført booking; prisoverslag = præciseret pris ellers listepris-snapshot | 8 |
| AI'en nævner aldrig priser og anbefaler aldrig klinikker; rangering efter faste, synlige kriterier i `RankingService` | 6.6, 7.3 |
| Objektorienteret backend: repositories (arver `BaseRepository`), services og controllers er klasser uden tilstand på tværs af requests; middleware, `lib/`, routes, sider og komponenter er funktioner | 2.1, 2.1.1 |
| AI-reglerne samlet i `features/cases/ai/rules.ts` | 7.8 |
| Anonym chat via Supabase anonymous sign-in; samme bruger-id ved konvertering; 48 timers sletning | 7.7 |
| [PROTOTYPE] 2026-10-25: ingen verificering af klinikker. En klinik, der opretter sig, bliver straks `verified` (signup-triggeren `handle_new_user()` via funktionen `prototype_auto_verify_clinics()`, migration `20261102000100_prototype_auto_verify.sql`; eksisterende `registered` klinikker med ejer blev verificeret). Importerede klinikker uden ejer forbliver basisklinikker. Kan slås til igen: ny migration, der erstatter funktionen med `select false`, og `SHOW_VERIFICATION_BANNER = true` i `verification-banner.tsx`. Brugerens beslutning | 3, 12.1 |
| Billedsamtykke kun lige før første upload | 9.4 |
| Billeder skrives kun med service role efter re-encoding; `case-images` har ingen klientpolicies; signering med service role efter RLS-beskyttet læsning | 9.2 |
| Service role-funktioner bruger ikke `auth.uid()` | 5.1 |
| Tests kører mod lokal Supabase | 2.3.1, 5.6 |

### 12.3 Åbne beslutninger [ÅBEN]

1. *Afklaret:* ubesvarede leads udløber ikke; patienten kan trække et ubesvaret lead tilbage (`withdrawn`), så pladsen bliver fri (4.2, 5.3).
2. *Afklaret:* afviste og tilbagetrukne leads tæller ikke med i de 3; kun aktive leads (`sent`, `accepted`, `booked`) tæller (4.3).
3. *Afklaret:* akutvejen kræver login. Den valgte tid reserveres straks (`held`), bliver en booking ved accept og frigives ved afvisning (4.3, 5.3, 6.1).
4. *Afklaret:* en booking er gennemført automatisk efter sluttid, medmindre klinikken har markeret udeblivelse (4.2, 8.1).
5. *Afklaret:* importerede klinikker viser kun Trustpilot (hvis kendt), ingen egne anmeldelser; egne anmeldelser kun for verificerede klinikker (6.6, 8.4).
6. **Kilde til import** af klinikker (CVR, Sundhedsstyrelsen, andet) og **overtagelse** af en importeret klinik: hvordan beviser en klinik, at den ejer rækken?
7. **Kalender:** én kalender pr. klinik (kun én booking ad gangen) er en forenkling. Skal kapaciteten være pr. tandlæge/stol, eller et tal pr. klinik?
8. *Afklaret:* beskedtråden er åben fra leadet er sendt, så klinikken kan stille afklarende spørgsmål før accept; kontaktoplysninger er stadig skjult til booking (4.3).
9. *Afklaret:* kataloget har to niveauer, kategorier og behandlinger. Startindholdet står i `docs/behandlingskatalog.md`, og bagefter vedligeholdes det i databasen uden kodeændringer (4.3).
10. *Afklaret:* klinikken ser både telefon og e-mail efter booking (4.4). Oprettede, men ikke verificerede klinikker er usynlige offentligt (ændret ved securitygennemgangen af trin 1, H1; 3, 5.1).
11. **Porteføljebilleder:** krav til samtykket (skriftligt, opbevares af klinikken), og må billeder vise ansigt?
12. **Standardsortering:** afstand med position, ellers første ledige tid. Ønsker gruppen en anden standard?
13. **Præcis geokodning** af klinikadresser (i dag postnummerets centrum, hvis importen ikke har koordinater).
14. *Afklaret (2026-10-18):* demoen kører **lokalt** på en bærbar som produktionsbuild (`npm run build && npm start`) mod det fælles Supabase-projekt; cron kører ikke, og det er uden betydning (effektiv status, 4.2). HSTS tjekkes i den lokale produktionsbuild med `curl -sI` (2.3). *Afklaret (2026-10-19):* appen afleveres ca. 2026-10-26 som kildekode og live demo på iPhone mod serveren på brugerens computer (13.8). **Stadig åbent:** hosting efter afleveringen.
15. **Ønsket tidsrum:** er de fire faste valg (hurtigst muligt, inden for 2 uger, inden for 3 måneder, fleksibel) nok, eller ønskes konkrete datoer?
16. *Afklaret:* klinikken har 24 timer efter sluttid til at markere `no_show`; først derefter er bookingen effektivt `completed`, og først derefter kan der anmeldes (4.2, 5.3, 8.1).
17. *Afklaret:* højst 10 leads i alt pr. sag uanset status, ud over loftet på 3 aktive. Patienten kan altid starte en ny sag (4.3, 5.3).
18. *Afklaret:* en reserveret akuttid (`held`) udløber efter 30 minutter uden svar, eller ved starttid, hvis den kommer før. Udløbet håndhæves i databasen uden cronjob (`hold_expires_at`, `release_expired_holds()`, effektiv status, 4.3). Accept efter udløb giver et accepteret lead uden booking.
19. *Afklaret:* Trustpilot for importerede klinikker indtastes manuelt af TandMatch (admin/seed) i prototypen; rigtig løsning er [UDSKUDT] (12.4).
20. *Afklaret:* klinikken mister adgangen til sagens indhold og beskedtråd, når patienten trækker leadet tilbage (4.4, 5.7).
21. *Afklaret:* lukning af en sag: `close_case()` trækker `sent` og ubookede `accepted` leads tilbage, frigiver reservationer og lader bookede tider bestå (5.3, 10.5).
22. *Afklaret:* booking-starttider skal ligge på hele kvarterer, håndhævet i databasen (`SLOT_STEP_MINUTES = 15`, 4.2).
23. *Afklaret:* tilbagetrækning af `health_data_sharing` trækker patientens `sent` og ubookede `accepted` leads tilbage og frigiver reservationer; bookede tider består og kan aflyses af patienten (5.3).
24. *Afklaret:* når en klinik sletter sin konto, afvises åbne leads med `clinic_left`, reservationer frigives, og fremtidige bookinger aflyses. En importeret klinik bliver `imported`: navn, adresse, postnummer, by, telefon og åbningstider bevares; prisliste, blokeringer, beskrivelse, tandlæger, portefølje, logo, e-mail, website og klinikindtastet Trustpilot slettes. En klinik, der oprettede sig selv (`import_source is null`), bliver `removed` (punkt 28; 5.3, 10.8).
25. *Afklaret:* klinikkernes uploads får samme IP-rate limit som patienters billedupload, 10 pr. time pr. IP (10.8, 1.9).
26. *Afklaret:* sletning af klinikkonto sletter også e-mail og website, og rækkeoprydningen ligger i triggeren `clinics_after_owner_removed()` (5.3, 1.9).
27. *Afklaret:* klinikcontrollerne deler logik ved komposition, ikke en fælles basisklasse (2.1.1).
28. *Afklaret:* en selvoprettet klinik, der mister sin ejer, slettes ikke, men får status `removed`. Den er skjult overalt og kan ikke vælges eller overtages; CVR nulstilles, så virksomheden kan oprette sig igen. Klinikindtastet indhold ryddes, og navnet bevares. Patienternes leads, beskeder, bookinger og anmeldelser bevares, og patienten ser "Klinikken er ikke længere på TandMatch". Anmeldelserne forsvinder fra offentligheden, men patienten kan se sin egen (4.2, 5.3).
29. *Afklaret:* offentligt vises kun `verified` og `imported` uden ejer; `registered` er usynlig, også efter CVR-overtagelse (5.1 regel 11).
30. **Klinikkens beskeder ved sletning af klinikkonto (security L6):** `messages.sender_id` har `on delete cascade`, så klinikkens beskeder forsvinder fra patientens tråd, når klinikkontoen slettes. Det strider mod beslutningen om, at patientens historik bevares (punkt 28). **Besluttet (2026-10-18):** `on delete set null` og en `sender_role`-kolonne (`patient`/`clinic`), så tråden viser "Klinikken" for beskeder uden afsender. Bygges med beskedtråden (5.2) i en ny migration; eksisterende rækker får `sender_role` ud fra afsenderens rolle.
31. **Forretningsmodel:** prototypen og siden "Sådan tjener vi penge" siger, at klinikker betaler for leads, og at patienter ikke betaler. Pris pr. lead, abonnement, betaling ved booking eller andet er ikke besluttet, og der er ingen betaling i koden.
32. **API-test til trin 6:** *Bookingdelen er løst (6.1):* `features/booking/__tests__/api/bookings.test.ts` tester en ikke-udløbet og en udløbet `held`-booking gennem API'et. *Anmeldelsesdelen er løst (6.2):* `features/booking/__tests__/api/reviews.test.ts` godkender en anmeldelse med service role lokalt og tester, at den vises i `GET /api/clinics/{id}/reviews` og påvirker prisnøjagtigheden.
33. *Afklaret (2026-10-18):* **begge dele.** Seed-scriptet får fire verificerede demoklinikker mere i Storkøbenhavn (2100, 1500, 2300, 2900), og `DEFAULT_MAX_DISTANCE_KM` hæves fra 25 til **50 km** (6.6), så demoen fra 2100 viser alle fem verificerede klinikker i Storkøbenhavn og de importerede inden for 50 km. Patienten kan stadig vælge 5, 10, 25 eller 100 km i filteret.
34. *Afklaret (2026-10-18):* **alle danske postnumre** før demoen, fra GeoNames (CC BY 4.0; DAWA blev nedlagt, 2026-10-19), som datafil i repoet (`supabase/data/postal-codes.csv`) og en idempotent migration (`20261028000400`), som brugeren kører i det fælles projekt med `supabase db push` (4.3, 11). Ingen netværkskald ved runtime.
35. **Sletning af patientkonto:** `DELETE /api/patients/me` sletter alt via cascade fra `patients`, også patientens leads, beskeder, kommende bookinger og anmeldelser. Klinikken ser dermed en booket tid forsvinde fra kalenderen uden besked, og en godkendt anmeldelse forsvinder fra profilen. I demoen accepteret [PROTOTYPE] med en tydelig advarsel på `/patient/konto` (architects forslag; ikke besluttet af brugeren, så trin 7 bygger forslaget). Før drift: skal kommende bookinger aflyses (synligt for klinikken), og skal anmeldelser anonymiseres i stedet for at slettes?
36. **Akutnumre pr. region (review 7.11):** Akuttelefonen 1813 gælder kun Region Hovedstaden. Prototypen bruger en generisk tekst ("lægevagten i din region") plus 1813 for Hovedstaden (`lib/leads/constants/emergency.ts`, 0.1 [PROTOTYPE], architects forslag; demoen foregår i Storkøbenhavn). Før rigtige patienter: skal nummeret vælges ud fra patientens postnummer (region), og hvem gennemgår teksterne fagligt (sammen med MDR-reviewet, 12.4)?
37. *Afklaret (2026-10-19, brugeren):* patientsiden er en React Native-app (Expo) i `mobile/`; klinikkens område bliver på Next.js-weben; Next.js er backend for begge; databasen er uændret (1.2, 13). Kun iOS testes (Expo Go på iPhone og iOS-simulator); ingen app store-build.
38. **Patientsiderne på weben efter afleveringen.** Architects forslag: behold forsiden, informationssiderne og den offentlige klinikoversigt og -profil på weben (de er nyttige for klinikker og for patienter, der finder os via søgning, og forsiden kan henvise til appen); fjern `/start`, `/akut` og `/patient/*` samt deres komponenter og e2e-tests i én opgave, når appen har været brugt i demoen uden fejl. Indtil da er de sat på pause (6, 13.6). Kræver brugerens beslutning.
39. **Auth i appen via vores API i stedet for supabase-js i appen.** Architects valg: appen får Supabase-tokens fra vores API og fornyer dem via `POST /api/auth/refresh`; appen har ingen Supabase-klient og ingen Supabase-nøgler (13.3). Fordel: én vej til data og auth, samme vilkårs-, samtykke- og rate limit-regler som weben, intet at lække. Ulempe: ca. 50 linjer egen fornyelseslogik. Alternativet (supabase-js med `auth`-delen i appen) er muligt, hvis brugeren foretrækker det.
40. **Lokal Supabase eller det fælles projekt til telefon-demoen.** Billed-URL'er (signerede URL'er fra `case-images`, logo og portefølje fra `public-media`) peger på Supabase' URL. Med lokal Supabase er det `127.0.0.1`, som en fysisk iPhone ikke kan nå (simulatoren kan). Architects forslag: demo på iPhone mod **det fælles projekt** (billeder virker), udvikling i simulatoren mod lokal Supabase (13.8).
41. **Hurtigsvar i appens chat (7.9, `quickReplies`).** Architects forslag: P2 (8.6g-8.6i) uden migration; hurtigsvarene gemmes ikke og forsvinder ved genindlæsning. Alternativet er at gemme dem på `ai_messages` (ny migration efter `20261028000500`), så de også ses efter genindlæsning. Kræver brugerens beslutning om, hvorvidt de skal med før afleveringen.
42. **Automatisk besked efter billedupload (7.9).** Architects forslag: appen sender den faste besked "Jeg har tilføjet et billede." som en chat-tur, så AI'en reagerer på billedet med det samme. Det koster én af de 30 beskeder. Alternativet er ingen automatisk besked: billedet kommer med til AI'en ved patientens næste besked, og inputfeltet viser hjælpeteksten "Fortæl, hvad billedet viser". Kræver brugerens beslutning; 8.7 bygger forslaget.
43. **Akut-blokken vises for ofte (brugerens test 2026-10-19).** I dag vises akut-blokken ved hver assistentbesked med `emergency`. Flaget sættes både af modellen og af nøgleordsdetektionen `detectEmergency()` i `features/cases/ai/`, som også erstatter svaret. Architects forslag (8.11e, P2): (a) appen viser akut-henvisningen **én gang pr. samtale** som en fastgjort blok øverst i chatten, i stedet for under hver besked; (b) ai-flow gennemgår `detectEmergency()`, så fx "ondt" eller "lidt hævet" alene ikke udløser flaget, og så detektionen kun **erstatter** svaret ved stærke tegn (hævelse med feber, blødning der ikke stopper, traume, livstruende tegn) og ellers kun sætter flaget. Rammen ligger fast: CLAUDE.md kræver, at AI'en straks henviser til akuttid ved tegn på noget akut. Derfor må reglen ikke svækkes for de tegn, der står i 7.3, og der må ikke komme falsk beroligelse. Provokationstestene for akut i `features/cases/__tests__/ai/` skal bestå uændret, og nye tests skal vise, hvilke milde formuleringer der ikke længere udløser blokken. Kræver brugerens godkendelse af listen over milde formuleringer.
44. *Afklaret (2026-10-22): nej, kun appen filtrerer (10.11 bygges ikke nu).* **Skal serveren afvise leads til klinikker, der ikke tilbyder sagens behandlinger?** Fra trin 9 viser appen kun klinikker med pris på alle sagens behandlinger og deaktiverer "Vælg klinik" for andre (mobile 13.4a), men `send_leads()` tjekker det ikke. Architects forslag: ikke før afleveringen; derefter en ny fejl `SERVICE_NOT_OFFERED` i `send_leads()` (ny migration), fordi klinikkens tid er dyr. Ulempen er, at en klinik, der fjerner en pris, kan gøre en halvfærdig afsendelse ugyldig. Kræver brugerens beslutning (trin 10.11).
45. *Afklaret (2026-10-22): nej, kataloget forbliver på 53 behandlinger (9.10 udgår).* **Fem nye standardbehandlinger i kataloget** (`hjemmeblegning`, `vurdering_behandlingsplan`, `foelsomme_tandhalse`, `snorkeskinne`, `lattergas`; `features/clinics/README.md` 4.3). Architects forslag: med før afleveringen (én migration, ingen kodeændringer). Kræver brugerens godkendelse af listen; uden den springes 9.10 over, og demoprofilerne bruger kun de eksisterende behandlinger.
46. *Architects forslag (6 beskeder) bruges, indtil brugeren siger andet.* **Grænsen for, hvornår behandlingskortet vises uden forslag** (`SERVICE_CARD_AFTER_USER_MESSAGES`, 7.9a): architects forslag er 6 patientbeskeder, og at AI'en højst stiller tre spørgsmål før forslag. Brugeren kan ønske et andet tal efter test.
47. **Egne behandlinger pr. klinik (trin 10):** "Andet" pr. kategori i kataloget (B) eller tabellen `clinic_custom_services` (A), `features/clinics/README.md` 4.3. Architects forslag: B først. Kræver brugerens beslutning, før trin 10.9 bygges.
### 12.4 Udskudt [UDSKUDT]

1. Databehandleraftale med OpenAI og overførsel til USA.
2. Fagligt review af MDR (foreløbig vurdering, forklaring af behandlinger, billedbeskrivelser).
3. Brugervilkår, privatlivspolitik og samtykketekster (inkl. deling af kontakt ved booking og portefølje).
4. Opbevaringsperiode og automatisk sletning af kontodata.
5. Streaming, realtime, notifikationer.
6. CAPTCHA og e-mailbekræftelse.
7. Overtagelse af anonym samtale ved login på eksisterende konto.
8. Adminside til moderation, verifikation og import.
9. Egen kortfliseudbyder.
10. Reklameregler for klinikkernes priser og profiler.
11. Trustpilot-data for importerede klinikker: rigtig kilde og opdatering (i prototypen indtaster TandMatch dem manuelt; scraping er ikke tilladt).
12. Juridisk gennemgang af klinikkens porteføljeerklæring (`PORTFOLIO_CONSENT_TEXT_VERSION`, pladsholdertekst, 9.5).
13. Prisforslag til klinikken i prislisten (fx typisk prisniveau pr. behandling). I prototypen skriver klinikken selv prisen.
14. Adminside til vedligeholdelse af behandlingskataloget.
15. Hosting af Next.js-appen (fx Vercel med EU-region) med planlagte jobs (cron). Demoen kører lokalt (2.3, 12.3 punkt 14).
16. Patient-appen: push-notifikationer (accept, besked, påmindelse om booking), Android, EAS-build og App Store/TestFlight, universelle links fra e-mail, offline-tilstand, e2e-test med Maestro, dataeksport som fil i appen (13).

### 12.5 Overgang fra den gamle model

Den gamle model (forespørgsler, tandlæger, svar, standard-spor) er fjernet fra koden i opgave 0.9 (commit `33d066f1`), og den genbrugte kerne er omskrevet til klasser i opgave 0.10. Indtil omlægningen er færdig, gælder:
- Kode fra den gamle model, der kan genbruges, hentes fra git (`e5cf7a04`), når afløseren bygges, og skrives om til klasser. Der er aldrig to versioner af samme ting.
- `docs/omlaegning.md` er arbejdsredskabet for, hvad der genbruges; den slettes, når omlægningen er færdig.
- Den gamle fejl i `try_consume_anonymous_ai_call()` (brugte `auth.uid()` under service role) er løst i det nye migrationssæt (5.1 regel 8, 5.3).

---
