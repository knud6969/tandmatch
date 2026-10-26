# Klinikker (`features/clinics`)

Domænet dækker klinikprofil, katalog, prisliste, åbningstider, tandlæger, portefølje, klinikoversigt, rangering og ledige tider.

- **Server:** `*Controller.ts`, `*Repository.ts`/`*Storage.ts`, `*Service.ts` direkte i mappen.
- **Web-UI:** `components/`, `pages/` (som `app/` videresender til) og `utils/`.
- **Grænseflade:** andre domæner importerer kun `index.ts` (server) og `ui.ts` (klientsikre komponenter).
- **Tests:** `__tests__/` (unit) og `__tests__/api/` (API).

Afsnittene nedenfor er flyttet uændret fra `docs/architecture.md` (oversigten). Numrene er bevaret, så henvisninger som "architecture 10.10" i koden stadig kan findes. Stier er opdateret til den nye struktur.

## 4. Datamodel

### 4.3 Tabeller

#### Behandlingskataloget: to niveauer

Kataloget har to niveauer: **kategorier** (`service_groups`, fx "Rodbehandling", "Implantater") og **behandlinger** (`services`), som hver hører til præcis én kategori. Derudover har hver behandling den overordnede **type** `services.category` (`general` / `cosmetic` / `emergency`), som akutlogik, akutfiltre og "kosmetisk eller almindelig" bruger. Kategori og type er uafhængige felter; reglen er, at alle behandlinger i kategorien `akut` har typen `emergency`, og ingen andre har det (check i migrationen via trigger).

Startindholdet (14 kategorier, 53 behandlinger: de 14 oprindelige slugs og 39 nye) står i bilaget `docs/behandlingskatalog.md`. **Kataloget vedligeholdes i databasen uden kodeændringer:** admin tilføjer, omdøber, omsorterer eller deaktiverer kategorier og behandlinger direkte (Supabase-dashboard eller script med service role; adminside [UDSKUDT]). Rækker slettes aldrig, fordi priser, sager og bookinger peger på dem; de deaktiveres med `is_active = false`. Koden må ikke afhænge af andre slugs end dem i `lib/clinics/constants/services.ts` (`EXAMINATION_SERVICE_SLUG = 'undersoegelse'`), og ingen kategori-slugs hardcodes.

#### `service_groups` (kategorier)
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| slug | text not null unique | check `^[a-z0-9_]{2,60}$`. Stabil nøgle, fx `rodbehandlinger` |
| name | text not null | Dansk navn, 1-80 tegn |
| description | text not null | Kort, neutral forklaring, 1-500 tegn |
| sort_order | smallint not null default 0 | |
| is_active | boolean not null default true | En inaktiv kategori skjuler alle dens behandlinger for patienter og klinikker |

#### `services` (behandlinger)
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| slug | text not null unique | Stabil nøgle, fx `undersoegelse`, `blegning`, `akut_konsultation`. Bruges af AI'en og i URL-filtre |
| group_id | uuid not null FK service_groups | Kategorien |
| name | text not null | Dansk navn |
| description | text not null | Kort, neutral forklaring til patienten. Må bruges af AI'en, når den forklarer behandlinger |
| category | service_category not null | Overordnet type: almindelig, kosmetisk eller akut |
| default_duration_min | smallint not null | Bruges, hvis klinikken ikke har angivet varighed. check 5-480 |
| sort_order | smallint not null default 0 | Inden for kategorien |
| is_active | boolean not null default true | Inaktive behandlinger (eller behandlinger i en inaktiv kategori) kan ikke vælges, prissættes eller foreslås. Eksisterende priser på dem vises ikke offentligt |

Kataloget skal mindst indeholde `undersoegelse` (bruges, når patienten er usikker, 7.3) og én aktiv behandling af typen `emergency` (akutvejen). Kun admin/migration skriver.

#### `clinic_service_groups` (klinikkens valgte kategorier)
| Felt | Type | Note |
|---|---|---|
| clinic_id | uuid FK clinics on delete cascade | PK sammen med group_id |
| group_id | uuid FK service_groups | Skal være aktiv ved valg |
| created_at | timestamptz | |

Klinikken vælger først de kategorier, den arbejder med, og prissætter derefter behandlinger i dem. Valget gemmes eksplicit (ikke udledt af priserne), så en klinik kan have valgt en kategori uden at have prissat den endnu, og så prislistens UI kan vise de valgte kategorier. Reglen håndhæves i databasen: en række i `clinic_prices` kræver, at behandlingens kategori er valgt af klinikken (trigger på `clinic_prices`). Fravalg af en kategori sletter klinikkens priser i den (i samme transaktion, `set_clinic_service_groups()`, 5.3). Valget er ikke offentligt; offentligheden ser kun priserne. Prisforslag til klinikken er [UDSKUDT] (12.4); klinikken skriver selv prisen.

#### `clinics`
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| owner_id | uuid FK profiles on delete set null, **unique**, null | Kontoen. `null` for importerede klinikker. Når ejeren slettes, kører triggeren `clinics_after_owner_removed()` (5.3): en importeret klinik går tilbage til `imported` med bevarede grunddata; en klinik, der oprettede sig selv (`import_source is null`), bliver `removed` (skjult, rækken bevares). Rækker slettes aldrig |
| status | clinic_status not null | Se 3. Se også `clinic_import_snapshots` nedenfor. Ændres kun af admin/service role eller af `clinics_guard()`, når ejeren fjernes. Check `clinics_status_owner_check`: `status in ('imported', 'removed') or owner_id is not null`, dvs. `registered` og `verified` har altid en ejer, og `removed` har ingen |
| cvr | text null, unique | check `^[0-9]{8}$`. Kan ikke ændres af klinikken. Nulstilles, når klinikken bliver `removed`, så virksomheden kan oprette sig igen som en ny klinik med samme CVR |
| name | text not null | |
| description | text null | max 1000 tegn |
| address, postal_code, city | text not null | Offentlige erhvervsoplysninger |
| lat, lng | double precision null | Klinikkens placering på kortet. Importerede klinikker: fra importen. Oprettede klinikker: slået op ud fra adressen, når klinikken oprettes og når adresse eller postnummer ændres; findes adressen ikke, postnummerets midtpunkt (`postal_codes`). Se "Placering ud fra adressen" nedenfor. Kun i Danmark (check i `set_clinic_location()`) |
| phone, email, website | text null | Offentlig kontakt. `website` har check `website ~ '^https?://'`; vises som link med `rel="noopener noreferrer nofollow ugc"` og `target="_blank"` |
| logo_path | text null | Bucket `public-media` (9.5) |
| logo_updated_at | timestamptz null | Sættes, når logoet uploades; bruges som `?v=` i logoets URL (9.5) |
| trustpilot_url | text null | Skal starte med `https://dk.trustpilot.com/` eller `https://www.trustpilot.com/` |
| trustpilot_score | numeric(2,1) null | 1.0-5.0, manuelt indtastet af klinikken |
| trustpilot_review_count | integer null | Manuelt |
| trustpilot_updated_at | timestamptz null | Sættes af trigger, når score ændres |
| trustpilot_entered_by | text null | `clinic` eller `admin`. For importerede klinikker indtastes Trustpilot-data manuelt af TandMatch (admin/seed) i prototypen (aldrig scraping; rigtig løsning [UDSKUDT], 12.4); bestemmer mærkaten "angivet af klinikken" / "angivet af TandMatch" (8.4) |
| import_source | text null | Fx `cvr`, `seed`. Kun admin/service role |
| verified_at | timestamptz null | Sættes af `admin_set_clinic_status()` |
| owner_since | timestamptz null | Sættes til `now()` af trigger, når `owner_id` sættes (signup eller CVR-overtagelse), og nulstilles, når ejeren fjernes. Klinikken ser kun leads med `sent_at >= owner_since` og de tilhørende beskeder, bookinger og anmeldelser, så en ny ejer aldrig ser en tidligere ejers data. Kan ikke ændres af klinikken |
| updated_at | timestamptz | |

`clinics_guard()` (BEFORE INSERT/UPDATE) sætter `lat`/`lng` til postnummerets midtpunkt, når en klinik selv ændrer `address` eller `postal_code` (migration `20261104000100`; før kun ved postnummer), afviser, at ikke-admins ændrer `owner_id`, `owner_since`, `status`, `cvr`, `import_source` og `verified_at`, sætter `owner_since` ud fra `owner_id`, sætter `trustpilot_entered_by = 'clinic'`, når klinikken selv ændrer Trustpilot-felterne, og afviser enhver ændring af en `removed` klinik (`CLINIC_REMOVED`). Når `owner_id` bliver `null` (ejerens konto slettet), ændrer guarden selve klinikrækken: en importeret klinik bliver `imported` (`verified_at` nulstilles); en selvoprettet klinik (`import_source is null`) bliver `removed` med `cvr`, `verified_at`, `phone`, `description`, `email`, `website`, `logo_path`, `logo_updated_at` og klinikindtastet Trustpilot nulstillet; navn, adresse, postnummer, by, koordinater og admin-indtastet Trustpilot bevares. Rækker i andre tabeller ryddes bagefter af `clinics_after_owner_removed()` (5.3).

#### Placering ud fra adressen (geokodning)

Besluttet 2026-10-26 (erstatter "Præcis geokodning [ÅBEN]", beslutninger 12.3 punkt 13). Reglen: **når en klinik oprettes, og når den ændrer adresse eller postnummer, slås adressen op på serveren, og den fundne `lat`/`lng` gemmes. Findes adressen ikke (eller er opslaget nede), bruges postnummerets midtpunkt** [PROTOTYPE, besluttet for demoen].

- **To trin, så opslaget aldrig kan få en gemning til at fejle.** (1) Rækken gemmes som hidtil: `handle_new_user()` (signup) eller `clinics_guard()` (adresse eller postnummer ændret) sætter postnummerets midtpunkt. (2) Derefter slår serveren adressen op, og et fund gemmes med `set_clinic_location(p_lat, p_lng)` (platform 5.3) med **klinikkens egen session** (ejer, permanent konto; RLS og kolonne-grants er uændrede, `lat`/`lng` er stadig ikke i grants). Ingen service role. Fejler trin 2 (timeout, netværk, ingen træf, ugyldigt svar, RPC-fejl), logges det uden adresse, og midtpunktet bliver stående; API-svaret er det samme som uden opslag.
- **Hvornår:** `AuthController.signup()` (identity) efter oprettelsen af en klinikkonto, via `ClinicLocationService` fra `features/clinics/index.ts` (også ved overtagelse af en importeret klinik; adressen er klinikkens egen), og `ClinicsController.patch()`, når `address` eller `postalCode` ændres. Ændring af kun `city` slår ikke op.
- **Klasserne** (2.1.1, udskiftelige): `GeocodingService` (`features/clinics/geocodingService.ts`, abstrakt basisklasse: `locate(address, near)` kalder underklassens `lookup()`, kaster aldrig og returnerer `null` ved fejl. Et træf godtages kun, hvis det ligger i Danmark (`isInDenmark()`), og hvis dets postnummer er det, klinikken har angivet, eller det ligger højst `MAX_GEOCODE_DISTANCE_KM` (15 km) fra postnummerets midtpunkt `near`). `NominatimGeocodingService` (`nominatimGeocodingService.ts`) er standarden; `FakeGeocodingService` (`fakeGeocodingService.ts`) bruges i tests. `createGeocodingService()` (`geocoding.ts`) vælger. `ClinicLocationService` (`clinicLocationService.ts`) samler opslag og gemning for controllerne. Senere kan Nominatim skiftes til Datafordeleren (DAR) med en ny underklasse uden ændringer andre steder. DAWA er lukket (1. okt. 2026).
- **Nominatim** (`https://nominatim.openstreetmap.org/search`, OpenStreetMap-data, ODbL): struktureret søgning `street`, `postalcode`, `city`, `countrycodes=dk`, `format=jsonv2`, `addressdetails=1`, `limit=1`; giver det intet træf, prøves én gang uden `city` (danske bynavne som "København V" matcher ofte ikke). Postnummerreglen ovenfor er nødvendig, fordi Nominatim ellers kan finde samme vejnavn i en anden by (fx "Nørrebrogade 20, 9000" gav Randers). **Brugspolitikken overholdes:** `User-Agent: TandMatch/0.1 (kontakt@tandmatch.dk)`, højst 1 kald pr. sekund for hele serverprocessen (en tidsplads pr. kald; må et kald vente over 2 s, springes opslaget over), timeout 4 s pr. kald, ingen gentagelser ved fejl, kun ved oprettelse og adresseændring (aldrig ved visning). Kun klinikkens erhvervsadresse sendes (offentlig oplysning, ingen persondata).
- **Tests og CI laver aldrig netværkskald:** `GEOCODING_FAKE=1` (kun når `NODE_ENV !== 'production'`, som `AI_FAKE_CLIENT`) giver `FakeGeocodingService`, som er deterministisk: adresser på formen `Kortvej <n>` får punktet `55.6761 + n/10000, 12.5683 + n/10000` (Københavns centrum forskudt) med det angivne postnummer, alt andet "ikke fundet" (midtpunktet). Brug et københavnsk postnummer i tests med `Kortvej`. `tests/api/run.sh` og `tests/e2e/run.sh` sætter variablen; enhedstestene giver `fetch` direkte.
- **Demo-seedet** (`scripts/seed-demo.ts`) laver ingen opslag: demoklinikkerne har opdigtede navne, men rigtige gadeadresser med husnumre i deres postnumre (ingen kendt tandklinik på adressen; Vesterbro-klinikken har 1620, fordi 1500 ikke har gadeadresser). Koordinaterne blev slået op én gang med Nominatim (2026-10-26, 1 s mellem kald), står fast i specifikationen og skrives med service role (2.3 h).

#### `clinic_import_snapshots`
| Felt | Type | Note |
|---|---|---|
| clinic_id | uuid PK, FK clinics on delete cascade | En række pr. overtaget importeret klinik |
| name, address, postal_code, city, phone | text | Grunddata, som de var før overtagelsen |
| lat, lng | double precision null | |
| opening_hours | jsonb | Åbningsvinduerne før overtagelsen |
| created_at | timestamptz | |

RLS er slået til uden policies; `anon` og `authenticated` har ingen rettigheder. `handle_new_user()` gemmer snapshottet, når en importeret klinik overtages via CVR. Når ejeren fjernes fra en importeret klinik, der **ikke** er verificeret, gendanner `clinics_guard()` grunddata og `clinics_after_owner_removed()` åbningstiderne fra snapshottet, så en uverificeret ejer aldrig kan efterlade ændrede offentlige data. Har ejeren været verificeret, bevares ejerens ændringer. Snapshottet slettes altid, når ejeren fjernes. Klinikker, der blev overtaget før migrationen `20261016000100_clinic_import_snapshot.sql`, har intet snapshot (12.1). Trustpilot hentes aldrig automatisk.

#### `clinic_prices` (prisliste)
| Felt | Type | Note |
|---|---|---|
| clinic_id | uuid FK clinics on delete cascade | PK sammen med service_id |
| service_id | uuid FK services | |
| price_min, price_max | integer not null | check `0 <= price_min <= price_max` |
| duration_min | smallint not null | check 5-480. Bruges til ledige tider (6.7) |
| note | text null | max 200, fx "inkl. 2 røntgenbilleder" |
| updated_at | timestamptz | |

**En klinik tilbyder en behandling**, når den er `verified` og har en række i `clinic_prices` for behandlingen, og behandlingen og dens kategori er aktive. Det er den eneste definition; den bruges af filteret `onlyOffering` (6.6), af prissorteringen og af appens "Se klinikker der kan hjælpe". `clinic_service_groups` er klinikkens interne valg af kategorier i prislistens UI og betyder **ikke**, at klinikken tilbyder alle behandlinger i kategorien (fx kan en klinik have valgt "Tandregulering" og kun prissætte "Samtale om tandregulering" og "Tandregulering med skinner", men ikke "Fast bøjle"). Valget er ikke offentligt. Basisklinikker (`imported`) har ingen prisliste og tilbyder derfor ingen behandlinger i denne forstand.

#### Tilføjelser til kataloget (trin 9.10) [IKKE BYGGET, kræver brugerens godkendelse, 12.3 punkt 45]

Kataloget har i dag 14 kategorier og 53 behandlinger (`docs/behandlingskatalog.md`). Det dækker de fleste søgninger, men disse fem er almindelige hos danske klinikker og noget, patienter selv efterspørger. De tilføjes med en ny migration `supabase/migrations/20261029000100_catalog_additions.sql` (ingen kørte migrationer ændres; `sort_order` efter reglen i bilaget, så de lægger sig efter de eksisterende i kategorien):

| slug | Kategori | Type | Navn | Beskrivelse | Min. |
|---|---|---|---|---|---|
| `hjemmeblegning` | `kosmetisk` | cosmetic | Blegning med skinner hjemme | Tilpassede skinner og blegemiddel, som du bruger hjemme efter klinikkens vejledning. | 30 |
| `vurdering_behandlingsplan` | `forebyggelse` | general | Vurdering af en behandlingsplan | Tandlægen ser på en plan eller et prisoverslag, du har fået et andet sted, og giver sin egen vurdering. | 30 |
| `foelsomme_tandhalse` | `forebyggelse` | general | Behandling af følsomme tænder | Behandling af tænder eller tandhalse, der er følsomme for koldt, varmt eller berøring. | 30 |
| `snorkeskinne` | `bidskinner` | general | Snorkeskinne | En tilpasset skinne til natten, der holder underkæben lidt frem for at mindske snorken. | 45 |
| `lattergas` | `tandlaegeangst` | general | Behandling med lattergas | En behandling, hvor du indånder lattergas for at slappe mere af. | 60 |

Beskrivelserne er neutrale som resten af kataloget (ingen priser, vurderinger eller løfter). "Invisalign" er et varemærke og tilføjes ikke; AI'en og patienten bruger `tandreguleringsskinner`. Bilaget opdateres ikke (det viser startindholdet).

#### Egne behandlinger og flere standardvalg (trin 10) [UDSKUDT]

Skitse til efter afleveringen; intet bygges før aflevering. Målet er mange standardvalg i kataloget og mulighed for, at klinikken kan tilbyde noget, kataloget ikke har.

1. **Flere standardvalg først.** Kataloget vedligeholdes i databasen (admin/service role, adminside [UDSKUDT] 12.4 punkt 14). Hver ny standardbehandling kan straks prissættes, filtreres på, foreslås af AI'en og bookes, uden kodeændringer. Det er altid førstevalget.
2. **Egne behandlinger pr. klinik**, når kataloget ikke slår til. To muligheder (12.3 punkt 47):
   - **A. Tabellen `clinic_custom_services`** (`id`, `clinic_id` FK clinics cascade, `group_id` FK service_groups, `name` 1-80, `description` 1-500, `price_min`, `price_max`, `duration_min`, `is_active`, `updated_at`; højst 20 pr. klinik; RLS som `clinic_prices`; offentlig via `public_clinic_profile()` for verificerede). Vises på klinikprofilen under kategorien med mærkatet "Klinikkens egen behandling". Indgår **ikke** i filteret, i AI'ens katalog eller i `case_services`. Booking kræver, at `bookings.service_id` kan pege på en egen behandling (ny nullable FK og check "præcis én"), og at `book_slot()` og ledige tider kender varigheden. Patienten nævner den i opsummeringen eller i beskedtråden.
   - **B. "Andet" pr. kategori** som almindelige katalogbehandlinger (`<kategori>_andet`, fx "Anden behandling inden for implantater"), hvor klinikken skriver navnet i prisens `note` (gøres påkrævet for disse). Ingen nye tabeller; filter, booking og leads virker uændret; AI'en foreslår dem aldrig (markeres i katalogkonteksten).
   Architects forslag: **B** først (lille, ingen ændring af booking), **A** når klinikker efterspørger flere egne linjer.
3. **Admin-overblik:** egne behandlinger, der går igen hos mange klinikker, løftes ind i kataloget som standardvalg.

#### `clinic_opening_hours`
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| clinic_id | uuid FK clinics on delete cascade | |
| weekday | smallint not null | ISO: 1 = mandag … 7 = søndag |
| opens_at, closes_at | time not null | Lokal tid. check `opens_at < closes_at`. Flere rækker pr. dag tilladt (fx frokostlukket) |
| is_emergency | boolean not null default false | **Akutvindue:** tider her kan kun bookes til akutydelser. Akutydelser kan også bookes i almindelige vinduer |

Overlappende vinduer samme dag afvises (trigger). Importerede klinikker kan have åbningstider fra importen.

#### `clinic_time_blocks`
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| clinic_id | uuid FK clinics on delete cascade | |
| starts_at, ends_at | timestamptz not null | check `starts_at < ends_at`. Lukket, ferie, fuldt booket via eget system |
| note | text null | Kun synlig for klinikken |

#### `clinic_dentists` (kun visning)
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| clinic_id | uuid FK clinics on delete cascade | |
| full_name | text not null | |
| title | text null | Fx "Tandlæge", "Specialtandlæge i ortodonti" |
| bio | text null | max 1000 |
| photo_path | text null | Bucket `public-media` |
| photo_updated_at | timestamptz null | Sættes, når portrættet uploades; bruges som `?v=` i portrættets URL (9.5). Migration `20261013000100_dentist_photo_version.sql` |
| sort_order | smallint not null default 0 | |

Tandlæger har intet login og ingen rolle. Leads og bookinger går til klinikken.

#### `portfolio_items`
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| clinic_id | uuid FK clinics on delete cascade | Redundant, for enkel RLS |
| dentist_id | uuid FK clinic_dentists on delete cascade | Skal tilhøre samme klinik (trigger) |
| service_id | uuid FK services null | Hvilken behandling billedet viser |
| image_path | text not null unique | Bucket `public-media` (9.5) |
| caption | text null | max 200. Ingen personoplysninger |
| patient_consent_confirmed_at | timestamptz not null | Klinikken bekræfter, at patienten på billedet har givet samtykke til offentliggørelse. Sættes server-side ved upload |
| consent_text_version | text not null | Den bekræftelsestekst, klinikken accepterede (`lib/identity/constants/consents.ts`, `PORTFOLIO_CONSENT_TEXT_VERSION`). Valideres af serveren mod konstanten, ikke mod `consent_text_versions` (9.5) |

Vises kun for verificerede klinikker.

## 6. Sider og routes (App Router)

### 6.3 Klinikflade (`/klinik`, rolle `clinic`)

[PROTOTYPE, 2026-10-25] Klinikker auto-verificeres ved oprettelse (`docs/beslutninger.md` 12.2), så banneret "Afventer verificering" vises ikke (`SHOW_VERIFICATION_BANNER = false` i `verification-banner.tsx`). Koden for `registered` står: en `registered` klinik kan sætte alt op, men indbakke og kalender er tomme, indtil den er verificeret.

**Fanerne (2026-10-24, klinik-web):** fire faner (`AREA_NAV.clinic` i `lib/common/navigation/areas.ts`): **Henvendelser** (`/klinik`), **Kalender**, **Anmeldelser** og **Klinikprofil** (`/klinik/profil`). Klinikprofil er også den aktive fane på `/klinik/prisliste`, `/klinik/aabningstider` og `/klinik/tandlaeger` (`NavItem.matches`); de fire opsætningssider har en lokal undernavigation (Profil · Prisliste · Åbningstider · Tandlæger, `ClinicSettingsNav` i `features/clinics`), og deres URL'er er uændrede. Fanen Henvendelser viser antallet af henvendelser, der **kræver handling** (se `/klinik`), som et lille tal; tallet kommer fra de samme data, som indbakken poller (én delt hentning af `/api/leads` hvert 20. sekund, `useClinicLeads()` i `features/leads/ui.ts`), og vises ikke, når tallet er 0 eller klinikken ikke er verificeret. Logoet fører en indlogget klinik til `/klinik`. Vandret rulning med fade i kanten (7.8, `area-tabs.tsx`) er bevaret til smalle skærme.

| Route | Indhold |
|---|---|
| `/klinik` | Lead-indbakke (bygget i 5.3) i API'ets rækkefølge: ubesvarede først, akut før ikke-akut, nyeste først (`clinic_leads()`; viewet sorterer ikke selv). **Filtre (2026-10-24):** "Kræver handling" (standard, når der er nogen; ellers "Alle") = status `sent` **eller** `unreadMessages > 0` (`leadNeedsAction()` i `lib/leads/domain/leads.ts`; aldrig `withdrawn`), "Venter på svar" (`sent`), Accepteret, Tid booket, Afvist, Trukket tilbage, Alle. Valget huskes, mens klinikken er på siden (også ved skift til et lead og tilbage). **Rækken:** status ("Venter på svar" for `sent`), akut-mærke (tone `danger`), en prik for "ikke åbnet" (`seenAt === null`, med skærmlæsertekst; erstatter mærket "Ny"), ulæste beskeder, ydelser, ved en reserveret akuttid "Svar inden kl. HH:MM" (`holdExpiresAt`), et uddrag af opsummeringen (`summaryExcerpt`, højst 120 tegn) og én faktalinje: listepris (`listPrice`, "ifølge din prisliste"), område, ønsket tidsrum eller tid og antal billeder. Ingen kontaktdata i listen. **Layout:** på mobil liste → lead-side (`/klinik/lead/[id]`); fra `lg` (Container `wide`) står listen til venstre og det valgte lead til højre, både på `/klinik` (højre side: "Vælg en henvendelse") og på `/klinik/lead/[id]` (listen med det valgte lead markeret, `aria-current`). Statuslinjen "N henvendelser venter på svar" står over filtrene, og antallet, der kræver handling, står i browserfanens titel, fx "(2) Henvendelser". **Opsætning:** fuld oversigt står på `/klinik/profil`; på `/klinik` vises kun én linje med link til Klinikprofil, når noget mangler (`ClinicSetupNotice`). Verifikationsbanneret står øverst og vises kun for en `registered` klinik. Siden henter klinikken én gang (`clinic-home.tsx`) til banner og opsætningslinje; indbakken bruger den delte lead-hentning |
| `/klinik/lead/[leadId]` | **Lead-kortet som ét overblik** (2026-10-24), bygget til under et minut, i denne rækkefølge (DOM og visning): (1) **titel** = ydelserne, med mærker (status, akut, ulæste) og ved en reserveret akuttid "Svar inden kl. HH:MM" (`booking.holdExpiresAt`); (2) **opsummering**, afkortet til 4 linjer med "Vis mere"/"Vis mindre" og et kort forbehold ("Godkendt af patienten [· lavet med AI]. Foreløbig – I vurderer endeligt."); (3) **billeder** i én vandret række af miniaturer; tryk åbner billedet stort i en lightbox (native `<dialog>`, fokus flyttes ind, Esc og "Luk" lukker, fokus tilbage til miniaturen; link "Åbn i ny fane" til den signerede URL); (4) **fakta på én linje**: område · afstand · ønsket tid/tidsrum · listepris · modtaget; (5) dit svar (efter beslutning) og patientens kontaktoplysninger (kun efter accept + booking, 4.4); (6) **beskeder** (åbne fra start, så klinikken kan spørge før beslutning). **Beslutningsbjælken** (Accepter / Kommentar ("Accepter med kommentar" + evt. præciseret pris) / Afvis) står i DOM lige efter titlen, så tastaturet når den tidligt; på mobil vises den som en fast bjælke i bunden (`sticky bottom-0`, `padding-bottom: env(safe-area-inset-bottom)`, formularerne for kommentar og afvisning åbner i bjælken med egen scroll), fra `lg` fast i toppen af lead-kolonnen (`sticky top-0`). **Afvisning:** ingen forvalgt årsag; klinikken vælger aktivt ("Vælg årsag" er ikke et gyldigt valg). **Efter et svar** viser bjælken "Næste henvendelse (N tilbage)", der åbner det næste lead, der kræver handling (indbakkens rækkefølge, det aktuelle lead udeladt); er der ingen, "Tilbage til henvendelser". Kortet henter leadet igen hvert 20. sekund, mens fanen er synlig (`useLoad({ pollMs })`), så kontaktoplysninger dukker op efter booking. Åbning sætter `seen_at`. Tilbagetrukne leads vises kun som "Trukket tilbage af patienten". Hjælpetekster er højst én linje |
| `/klinik/kalender` | Bookinger og reserverede akuttider pr. dag/uge, marker udeblevet (fra starttid til 24 timer efter sluttid), aflys; blokeringer. Besøg bliver automatisk gennemført, når fristen er udløbet. Reserverede akuttider vises med udløbstidspunkt. Bygget i 6.4 som dagskort (to kolonner fra `lg`, ingen ugevisning); aflyste tider vises (også kommende) dæmpet i dagslisten med hvem der aflyste og klinikkens evt. grund, uden knap til at skjule dem (10.10, 2026-10-24); fra 6.7 starter listen ved i dag, og tidligere dage ligger bag "Vis tidligere dage (n)"; en ikke-verificeret klinik ser en kort tekst i stedet for en fejl (det samme på `/klinik/anmeldelser`); udeblevet og aflys kræver bekræftelse; link til lead-kortet; punktet "Kalender" i klinikkens navigation. Blokeringer redigeres fortsat på `/klinik/aabningstider` |
| `/klinik/profil` | Fanen **Klinikprofil** (2026-10-24): undernavigationen, opsætningsoversigten (`clinic-overview`: klinikkens navn, status, og om profil, prisliste, åbningstider og tandlæger er klar, med link til hver), derefter grunddata, beskrivelse, logo, kontakt, Trustpilot og nederst kontoen: slet konto (`features/clinics/components/delete-account.tsx`; advarsel om, at åbne leads afvises og fremtidige bookinger aflyses) |
| `/klinik/profil/forhaandsvisning` | **Forhåndsvisning** (2026-10-24): klinikkens egen offentlige profil, som patienten ser den i appen, med mærket "Forhåndsvisning – sådan ser patienter din profil i appen". Link "Se din profil som patienten ser den" fra `/klinik/profil`. Data fra `GET /api/clinics/me` (sessionens egen klinik, altså ejer-tjek på serveren; ingen id i adressen, ingen ny offentlig route). For en `verified` klinik hentes også den offentlige `GET /api/clinics/{id}`, så stjerner og første ledige tid er de rigtige; en `registered` klinik (i prototypen kun hvis den er sat tilbage; signup giver `verified`) ser profilen på fuldt niveau med en note om, at klinikken ikke er offentlig endnu, og tekst i stedet for anmeldelser og første ledige tid. Samme sektioner og rækkefølge som appens `clinic-profile-screen.tsx`: Om klinikken → Placering → Åbningstider → Prisliste → Anmeldelser på TandMatch → Trustpilot (ingen ledige tider, tandlæger eller e-mail, som appen heller ikke viser). Sektionen **Placering** (både her og på den offentlige webprofil) har under kortet to links til vejvisning, der åbner i en ny fane (`rel="noopener noreferrer"`): "Vejvisning i Google Maps" (`https://www.google.com/maps/dir/?api=1&destination=lat,lng`) og "Vejvisning i Apple Maps" (`https://maps.apple.com/?daddr=lat,lng&dirflg=d&q=<navn>`). URL'erne bygges af `googleMapsDirectionsUrl()` og `appleMapsDirectionsUrl()` i `lib/clinics/domain/directions.ts`, som appen også bruger til sin knap "Vis vej" (Apple Maps). Bygget med samme komponent som den offentlige webprofil (`ClinicProfileContent` i `features/clinics/components/clinic-profile-view.tsx`, `mode: "public" \| "preview"`). Den offentlige webprofil `/klinikker/[clinicId]` (features/site) følger samme rækkefølge i én kolonne og har derudover ledige tider og tandlæger efter prislisten; sektionen "Kort" hedder "Placering" som i appen |
| `/klinik/prisliste` | To trin på samme side: (1) klinikken krydser de kategorier af, den arbejder med (fravalg af en kategori med priser kræver bekræftelse, fordi priserne slettes); (2) under hver valgt kategori vises dens behandlinger med beskrivelse; klinikken krydser dem af, den tilbyder, og skriver prisinterval (fra-til), varighed (forudfyldt med standardvarighed) og evt. note. Hjælpetekst: tom "Pris til" betyder en fast pris. Ingen prisforslag (12.4) |
| `/klinik/aabningstider` | Ugeskema og akutvinduer |
| `/klinik/tandlaeger` | Tandlæger og deres portefølje (upload med bekræftelse af patientens samtykke) |
| `/klinik` (trin 10.7, bygget) | Henvendelser fra appen ses uden manuel genindlæsning: indbakken (`features/leads`) henter `/api/leads` igen hvert 20. sekund, mens fanen er synlig (`document.visibilityState`, delt `startVisiblePolling` i `lib/common/domain/polling.ts`), og viser antallet af ubesvarede leads i en statuslinje og antallet, der kræver handling, i browserfanens titel og på fanen Henvendelser (2026-10-24; én delt hentning, se Fanerne). Samme polling på kalenderen for nye bookinger. Ingen realtime (princip 8) |
| `/klinik/anmeldelser` | Godkendte anmeldelser + offentligt svar. Bygget i 6.5: anmeldelser med stjerner, tekst, prisnøjagtighed og måned; svarformular, når `replyStatus` er `null`; eget svar med status; punktet "Anmeldelser" i navigationen |

### 6.6 Klinikoversigt, rangering og filtre

Rangeringen ligger i `RankingService` (`features/clinics/rankingService.ts`, ingen I/O, enhedstestet) og bruges af `ClinicDirectoryController`. Den er **ikke** AI-baseret, og kriterierne vises for patienten. API og rangering er bygget (2.1-2.3); listen, kortet og profilen i UI bygges i 2.5-2.6. Sorteringsnøglerne og deres danske navne står i `lib/clinics/constants/clinics.ts` (`CLINIC_SORTS`, `CLINIC_SORT_LABEL`).

**Visningsniveau pr. klinik** (bestemmes af `public_*`-funktionerne ud fra `clinics.status`):

| Niveau | Status | Felter |
|---|---|---|
| Basis | `imported` uden ejer (`registered` vises slet ikke) | Navn, adresse, kortplacering, kontakt (telefon, web), åbningstider og Trustpilot (hvis kendt). **Ingen egne anmeldelser og ingen prisnøjagtighed.** Kan ikke vælges til leads |
| Fuld | `verified` | Basis + logo, beskrivelse, priser, varighed, første ledige tid og akuttid, tandlæger, portefølje, egne anmeldelser og prisnøjagtighed. Kan vælges |

**Sortering** (patienten vælger én; kriteriet står ved listen):

| Nøgle | Kriterium | Retning |
|---|---|---|
| `price` | Sum af `price_min` for de valgte ydelser i klinikkens prisliste | laveste først |
| `rating` | `avg_stars`, derefter `review_count` | højeste først |
| `price_accuracy` | `price_accuracy_pct` | højeste først |
| `distance` | Haversine fra patientens postnummer eller position (gemmes ikke) til klinikkens `lat/lng` | nærmeste først |
| `first_available` | Første ledige tid for den valgte ydelse (6.7) | tidligste først |

- Standard: `distance`, hvis patienten har angivet postnummer eller position; ellers `first_available`. På `/akut`: `first_available` for akutydelsen, kun klinikker med akuttid.
- Klinikker uden værdi for kriteriet (fx ingen prisliste, ingen anmeldelser, basisniveau) sorteres **sidst**. Ved lighed: navn.
- Prissortering og prisvisning gælder kun verificerede klinikker med pris for **alle** valgte ydelser.
- **Filtre** (regler som bygget):
  - **Behandlinger:** slugs i `?services=`, højst `MAX_SELECTED_SERVICES` (5). En ukendt eller inaktiv slug giver 400 `UNKNOWN_SERVICE`. **Valgte behandlinger filtrerer ikke i sig selv:** de bestemmer kun pris, prissortering og første ledige tid, og klinikker uden pris for alle valgte står sidst.
  - **Kun klinikker, der tilbyder behandlingerne** (`onlyOffering=true`, trin 9.8, bygget): kun verificerede klinikker med pris på **alle** valgte behandlinger (4.3, "En klinik tilbyder en behandling"), dvs. `priceForSelection !== null`. Basisklinikker og verificerede klinikker uden pris på én af behandlingerne falder fra. Kræver mindst én valgt behandling (ellers 400 `VALIDATION_ERROR`, som `maxPrice`). Kriterielinjen er "Kun klinikker med pris på alle valgte behandlinger". Filteret ligger i `RankingService.filter()` sammen med de andre filtre. Appen sætter det, når der er valgt behandlinger (13.4); weben ignorerer det.
  - **Position:** `postalCode` eller `lat`+`lng` (aldrig gemt). Ukendt postnummer giver 400 `UNKNOWN_POSTAL_CODE`; `lat` uden `lng` (eller omvendt) giver 400.
  - **Maks. afstand:** `maxDistanceKm` (standard `DEFAULT_MAX_DISTANCE_KM` i `lib/clinics/constants/clinics.ts` = 50 km, bygget i 7.16, besluttet 12.3 punkt 33; samme standard i API'et, oversigten, URL-filtrene og `/akut`) gælder kun, når der er en position; så falder klinikker uden koordinater fra. Uden position filtreres der ikke på afstand.
  - **Maks. pris:** `maxPrice` kræver mindst én valgt behandling (ellers 400) og sammenlignes med summen af `price_min` for de valgte behandlinger; klinikker uden pris for alle valgte falder fra.
  - **Min. stjerner**, **kun med akuttid** inden for `EMERGENCY_FILTER_HOURS` (48 timer) og **kun klinikker, der kan kontaktes** (`verified`).
  - Ukendte query-parametre ignoreres (`readQuery`).
- MVP: alle klinikker hentes og sorteres i API'et (få klinikker). Sidevisning [UDSKUDT].
- Kortet (`features/clinics/components/clinic-map.tsx`) er en klientkomponent, der indlæses dynamisk uden SSR (Leaflet kræver `window`), og viser præcis listens resultat. Desktop: liste og kort side om side; mobil: skift mellem dem.
- **Baggrundskort (besluttet 2026-10-26):** vektorfliser fra **OpenFreeMap** (`https://tiles.openfreemap.org/styles/positron`; gratis, ingen nøgle eller konto, data fra OpenStreetMap) tegnet af MapLibre GL (`maplibre-gl` 6.14.0) i Leaflets flisepanel via `@maplibre/maplibre-gl-leaflet` 0.1.4 (`features/clinics/utils/vector-base-layer.ts`), så markører, popups og cirkler stadig er Leaflet. Stilen "positron" er valgt frem for "liberty", fordi den er lys og rolig med tydelige vejnavne som appens Apple Maps (liberty er mere farverig, men har busikoner og 3D-bygninger, der larmer bag markørerne). Altid synlig kreditering "OpenFreeMap © OpenMapTiles Data © OpenStreetMap-bidragydere" med links i Leaflets attributionskontrol. Kun i browseren (kortet indlæses uden SSR); MapLibres stylesheet importeres i `clinic-map.tsx`. MapLibres worker udgives af bundleren som en fil på egen oprindelse (`setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url))`). CSP: `connect-src https://tiles.openfreemap.org` (stil, fliser, skrifttyper, ikoner) og `worker-src 'self' blob:`; ingen eksterne billedkilder til kortet, og OSM's fliseserver bruges ikke længere. Laget har en lille rettelse af pakkens `_transitionEnd`, så en animationsramme efter at kortet er fjernet ikke giver en fejl. CARTO Voyager blev fravalgt, fordi CARTOs gratis basiskort nu kræver en API-nøgle. OpenFreeMap er en offentlig tjeneste uden aftale [PROTOTYPE]; egen fliseserver (OpenFreeMap kan selvhostes) er [UDSKUDT].
- **Som i appen** (`mobile/src/components/clinic-directory/clinic-map.tsx`, så weben og appen ser ens ud): runde markører med et kors (✚); verificeret = udfyldt blå (`brand-600`) med hvid kant, basis = hvid med stiplet grå kant og gråt kors; den valgte markør (åben popup, eller kortet i listen, man holder musen over) er større med mørkeblå kant (`brand-800`). Ingen pris på markørerne (som i appen; prisen står i popuppen). Har svaret et udgangspunkt (`origin`, 10.7), vises det som en lille mørkeblå prik med hvid kant, og afstandsgrænsen (`maxDistanceKm`) som en tynd blå cirkel. Udsnit som appens `regionForClinics`: alle markører (og udgangspunktet) med luft omkring, højst zoom 14; én klinik zoom 15; ingen klinikker: Danmark. Zoomknapperne står øverst til højre; ingen rotation. Kortet på profilen er et fast udsnit som i appen (ingen panorering eller zoom) med en dråbeformet blå nål.

**Usikker patient:** AI'en spørger først ind (7.3). Er patienten stadig usikker, foreslås ydelsen Undersøgelse, og patienten sendes til oversigten med justerbare kriterier.

### 6.7 Ledige tider

Beregnes i `AvailabilityService` (`features/clinics/availabilityService.ts`, ingen I/O, enhedstestet) ud fra data fra `AvailabilityRepository` (`public_clinics`/`public_clinic_profile` for åbningstider og priser, `public_busy_intervals()` for optaget tid). `book_slot()` gentager tjekket i databasen, så beregningen ikke er en sikkerhedsgrænse.

- **Input:** åbningsvinduer (lokal tid `Europe/Copenhagen`, inkl. `is_emergency`), optagede tidsrum, ydelsens varighed (klinikkens `duration_min`, ellers katalogets `default_duration_min`), om ydelsen er akut, tidsinterval.
- **Slots:** starttider på hele kvarterer (`SLOT_STEP_MINUTES = 15`; minut 0/15/30/45, sekunder 0, lokal tid; kræves også af databasen) inden for et vindue, hvor `start + varighed` ligger helt i vinduet og ikke overlapper optaget tid. Almindelige ydelser kun i almindelige vinduer; akutydelser i begge.
- **Grænser:** tidligst `now + MIN_BOOKING_NOTICE_MIN` (30 min, akut 0 min), senest `BOOKING_HORIZON_DAYS` (60 dage). "Første ledige tid" i oversigten søges inden for `FIRST_AVAILABLE_SEARCH_DAYS` (14 dage); ellers "Ingen ledige tider de næste 14 dage".
- Værdierne står i `lib/booking/constants/bookings.ts` og er MVP-værdier. Dem, databasen også håndhæver, står med samme tal i migrationen (tabel i 7.6).
- Kun verificerede klinikker har ledige tider.
- **Første ledige tid i oversigten** måles for de valgte behandlinger (varighederne lagt sammen som én sammenhængende tid); uden valg for Undersøgelse (`EXAMINATION_SERVICE_SLUG`). **Første akuttid** (`firstEmergencyAt`) sættes kun for klinikker med et akutvindue og måles for den valgte akutbehandling, ellers for klinikkens korteste akutbehandling.
- Tider regnes i `CLINIC_TIME_ZONE` (`Europe/Copenhagen`). `GET /api/clinics/{id}/availability` dækker højst `MAX_AVAILABILITY_RANGE_DAYS` (14) dage pr. kald. Optaget tid hentes med `AvailabilityRepository.listBusyIntervals()` (`public_busy_intervals()`).

---

## 9. Billeder og storage

### 9.5 `public-media`: logo, tandlæger og portefølje

Stier: `clinics/{clinic_id}/logo.jpg`, `clinics/{clinic_id}/dentists/{dentist_id}.jpg`, `clinics/{clinic_id}/portfolio/{item_id}.jpg`. Bygget i trin 1.

- **Versionerede URL'er:** logo og tandlægeportrætter overskrives på samme sti, når de udskiftes. Den offentlige URL får derfor en version (`?v=<tidsstempel for seneste upload>`), så browsere og CDN ikke viser et gammelt billede. Portrætter bruger `clinic_dentists.photo_updated_at` og logoet `clinics.logo_updated_at`, så andre profilændringer ikke skifter logoets URL. Porteføljebilleder får en ny sti pr. element og behøver ikke version.

- Offentlig læsning. Ingen skriverettigheder for `authenticated` eller `anon`; serveren skriver og sletter med service role (`PublicMediaStorage`) efter ejertjek med brugerens klient (`ClinicsRepository.requireOwnId()`). `setLogoPath` sætter kun logo på en klinik, som brugeren stadig ejer (security L3).
- Samme behandling som patientbilleder: størrelsestjek, magic bytes, re-encoding, EXIF fjernes.
- **Portefølje:** upload kræver, at klinikken afkrydser en bekræftelse af, at patienten på billedet har givet skriftligt samtykke til offentliggørelse, og at billedet ikke viser ansigt eller andet identificerende [ÅBEN, 12.3]. Serveren gemmer `patient_consent_confirmed_at` og `consent_text_version` på `portfolio_items`. Klinikken er dataansvarlig for samtykket. Sletning fjerner rækken og filen.
- **Porteføljebekræftelsen er klinikkens erklæring, ikke et patientsamtykke.** Den gemmes derfor ikke i `consents` eller `consent_text_versions` (`consent_type` omfatter kun patientens egne samtykker). Den gyldige version står som konstanten `PORTFOLIO_CONSENT_TEXT_VERSION` i `lib/identity/constants/consents.ts`, og serveren afviser andre versioner. Teksten er en pladsholder, der skal gennemgås juridisk (12.4).
- Vises kun for verificerede klinikker (via `public_clinic_profile()`); filerne er dog offentlige, når de er uploadet.

---

## 10. API-kontrakter

### 10.4 Ydelseskatalog

Bygget (trin 1 og 1.9). Routen er offentlig, så `ServicesController` tager `session: Session | null` (2.1.1).

```ts
// lib/clinics/types/services.ts
export type ServiceGroupDto = { id: string; slug: string; name: string; description: string; services: ServiceDto[] };
// ServiceDto (10.1) får også groupId og groupSlug
```

| Metode og route | Rolle | Input | Output |
|---|---|---|---|
| GET `/api/services` | alle | `?category=` (overordnet type, valgfri) | `{ groups: ServiceGroupDto[] }`: aktive kategorier med deres aktive behandlinger, begge sorteret efter `sort_order`. Kategorier uden aktive behandlinger (efter filter) udelades. Det er den eneste hentning af kataloget; views laver selv en flad liste ved behov |

### 10.7 Klinikoversigt og profil (offentligt)

Bygget i trin 2 (2.3). `ClinicDirectoryController` (offentlig, `session: Session | null`) bruger `ClinicDirectoryRepository` (`public_*`-funktionerne), `AvailabilityRepository.listBusyIntervals()`, `RankingService` og `AvailabilityService`. Offentlige anmeldelser og statistik (`public_reviews()`, `public_clinic_review_stats_many()`) læses i `ReviewsRepository` (`listPublic()`, `reviewStats()`, flyttet fra `ClinicDirectoryRepository` i 6.2; DTO'erne er uændrede); `ClinicDirectoryController` får det som dependency `reviews`. Trustpilot-felterne mappes ét sted, `trustpilotFromColumns()` i `platform/db/mappers.ts`. **Mellemformer (besluttet):** `PublicClinicRecord` og `PublicClinicProfileRecord` (rækkerne fra `public_*` før rangering og DTO-formning) er server-interne og ligger i `features/clinics/clinicDirectoryRepository.ts`, ikke i `lib/<domæne>/types/`. Tidsintervaller har én type, `BusyInterval` i `lib/clinics/types/clinics.ts`, som repository, service og controller bruger. `public_reviews()` returnerer `created_at` (migration `20261017000100`), og `createdMonth` i `PublicReviewDto` beregnes som `"YYYY-MM"` i dansk tid med `toClinicMonth()` i `lib/common/domain/time.ts`, som også har `DAY_MS`. `servicesParamSchema` (validering af `?services=`) eksporteres fra `lib/clinics/schemas/clinics.ts` og bruges af både API og views. Filterreglerne og fejlkoderne står i 6.6; beregningen af første ledige tid i 6.7.

```ts
// lib/clinics/types/clinics.ts
export type ClinicStatus = (typeof CLINIC_STATUSES)[number]; // "imported" | "registered" | "verified" | "removed" (2.1)
export type OpeningHoursDto = { weekday: number; opensAt: string; closesAt: string; isEmergency: boolean };
export type ClinicPriceDto = { serviceId: string; serviceSlug: string; serviceName: string; price: PriceRange; durationMin: number; note: string | null };

export type ClinicListItemDto = {
  id: string;
  name: string;
  tier: "basic" | "full";
  canReceiveLeads: boolean;            // status === "verified"
  address: string; postalCode: string; city: string;
  location: { lat: number; lng: number } | null;
  phone: string | null; website: string | null;
  openingHours: OpeningHoursDto[];
  distanceKm: number | null;
  trustpilot: TrustpilotInfo;          // alle niveauer, når kendt
  // kun tier "full", ellers null/[]
  reviewStats: ReviewStats | null;     // egne anmeldelser kun for verificerede
  logoUrl: string | null;
  prices: ClinicPriceDto[];            // for de valgte ydelser
  priceForSelection: PriceRange | null;// sum for de valgte ydelser; null hvis en mangler
  firstAvailableAt: string | null;     // for de valgte behandlinger, ellers Undersøgelse (6.7)
  firstEmergencyAt: string | null;     // kun klinikker med akutvindue (6.7)
};

export type ClinicProfileDto = ClinicListItemDto & {
  description: string | null;
  email: string | null;
  allPrices: ClinicPriceDto[];
  dentists: { id: string; fullName: string; title: string | null; bio: string | null; photoUrl: string | null;
              portfolio: { id: string; imageUrl: string; caption: string | null; serviceName: string | null }[] }[];
};

export type SlotDto = { startsAt: string; endsAt: string };
```

| Metode og route | Rolle | Input | Output |
|---|---|---|---|
| GET `/api/clinics` | alle | `?ids=uuid,uuid` (valgfri, højst 3; kun disse klinikker, via `public_clinics(p_clinic_ids)`; bruges af afsendelsessiden) `&services=slug,slug&postalCode=&lat=&lng=&maxDistanceKm=&maxPrice=&minStars=&emergency=true&contactableOnly=true&onlyOffering=true&sort=price\|rating\|price_accuracy\|distance\|first_available` | `{ clinics: ClinicListItemDto[], sort, criteria: string[], origin: { lat, lng } \| null }`. Sorteret af `RankingService` (6.6). `lat/lng` gemmes ikke. `origin` er udgangspunktet for afstandene, så appen kan vise udgangspunkt og radius: den givne position **afrundet til 2 decimaler** (ca. 1 km, `publicOrigin()` i `ClinicDirectoryController`; afstandene regnes stadig på den præcise position), ellers postnummerets punkt fra `postal_codes`, ellers `null` (ingen afstand). Fra 2026-10-24; weben ignorerer feltet 400 `UNKNOWN_SERVICE` (ukendt slug eller over 5), 400 `UNKNOWN_POSTAL_CODE`, 400 ved `lat` uden `lng` eller `maxPrice`/`onlyOffering` uden valgte behandlinger. Ukendte parametre ignoreres. `onlyOffering` (6.6) er bygget i trin 9.8; skemaet i `lib/clinics/schemas/clinics.ts` (`queryBoolean`) |
| GET `/api/clinics/{id}` | alle | `?services=` (samme regler) | `ClinicProfileDto`. `distanceKm` er altid `null` på profilen; 404 for klinikker, der ikke er offentlige (5.1 regel 11) |
| GET `/api/clinics/{id}/availability` | alle | `?serviceId=&from=&to=` (max 14 dage pr. kald) | `{ slots: SlotDto[] }`. Kun verificerede; 404 ellers (6.7) |
| GET `/api/clinics/{id}/reviews` | alle | | `{ stats: ReviewStats, reviews: PublicReviewDto[] }`. 404 for ikke-verificerede klinikker |

### 10.8 Egen klinik (rolle `clinic`)

Bygget i trin 1 og 1.9 (undtagen anmeldelser). Billedupload (logo, portræt, portefølje) læses med `readImageForm` (2.1) og er IP-rate-limited med `enforceIpRateLimit("clinic-image-upload", req)`: 10 pr. time pr. IP, samme grænse som patienters billedupload (429 `RATE_LIMITED`). En tom PATCH (`{}`) på profil, tandlæge eller porteføljeelement returnerer den uændrede ressource (200) i alle routes. Lofterne står i 7.6. Delt logik mellem `ClinicsController` (profilens forhåndsvisning) og `ClinicDentistsController` ligger i `lib/clinics/domain/dentists.ts` (`attachPortfolio()`), så controllerne ikke kalder hinanden.

| Metode og route | Input | Output |
|---|---|---|
| DELETE `/api/clinics/me` | `{ confirm: "SLET" }` (`deleteAccountSchema` i `lib/identity/schemas/auth.ts`, samme som patientens; erstattede `deleteClinicSchema` i 7.12b) | 204. Rækkefølge: (0) controlleren henter klinikkens id med **brugerens** klient (`ClinicsRepository.requireOwnId()`), aldrig med service role (2.3), (1) sletter klinikkens filer i `public-media` (logo, tandlægeportrætter, portefølje) med service role, (2) sletter auth-brugeren via `AccountDeletionService` (service role), (3) triggeren `clinics_after_owner_removed()` (5.3) afviser åbne leads med `clinic_left` og aflyser fremtidige bookinger, og derefter: en **importeret** klinik bliver `imported` med bevarede grunddata (navn, adresse, postnummer, by, telefon, åbningstider og Trustpilot indtastet af admin), mens prisliste, valgte kategorier, blokerede tider, tandlæger, portefølje, beskrivelse, logo, e-mail, website og klinikindtastet Trustpilot slettes; en klinik, **der oprettede sig selv** (`import_source is null`), bliver `removed`: skjult overalt, CVR nulstillet, samme oprydning plus åbningstider og telefon; kun navn og adresse bevares, så patienternes historik består (5.3). Logger ud |
| GET/PATCH `/api/clinics/me` | PATCH `{ name?, description?, address?, postalCode?, city?, phone?, email?, website?, trustpilotUrl?, trustpilotScore?, trustpilotReviewCount? }` | `ClinicProfileDto & { status: ClinicStatus; cvr: string }` (forhåndsvisning af fuld profil uanset status). Ændres `address` eller `postalCode`, slås den nye adresse op, og `location` i svaret er den fundne placering eller postnummerets midtpunkt (4.3 "Placering ud fra adressen"); svaret kan tage op til ca. 4 s længere, men fejler aldrig på grund af opslaget. `reviewStats` er bevidst `null` i forhåndsvisningen; klinikkens egne anmeldelser hentes fra `GET /api/clinics/me/reviews` (10.13) |
| POST/DELETE `/api/clinics/me/logo` | multipart `file` | `{ logoUrl }` / 204 |
| GET/PUT `/api/clinics/me/service-groups` | PUT `{ groupIds: string[] }` (erstatter valget; kun aktive kategorier) | `{ groupIds: string[] }`. PUT kalder `set_clinic_service_groups()`; priser i fravalgte kategorier slettes (UI advarer først) |
| GET/PUT `/api/clinics/me/prices` | PUT `{ prices: { serviceId, priceMin, priceMax, durationMin, note? }[] }` (erstatter hele listen; højst 100 rækker; priser 0-1.000.000 kr.; kun behandlinger i valgte kategorier) | `{ prices: ClinicPriceDto[] }`; 400 ved overskridelse; 409 `SERVICE_GROUP_NOT_SELECTED`. Udskiftningen sker i én transaktion via `replace_clinic_prices()`; en tom liste sletter alle priser |
| GET/PUT `/api/clinics/me/opening-hours` | PUT `{ hours: { weekday, opensAt: "HH:MM", closesAt: "HH:MM", isEmergency }[] }` (højst 42 vinduer) | `{ hours: OpeningHoursDto[] }`; 400 ved overskridelse. I én transaktion via `replace_opening_hours()`; en tom liste sletter alle vinduer |
| GET/POST `/api/clinics/me/time-blocks` | POST `{ startsAt, endsAt, note? }`; GET `?from=&to=` | `{ blocks: { id, startsAt, endsAt, note }[] }` / 201; 429 `TIME_BLOCK_LIMIT` ved over 200 blokeringer |
| DELETE `/api/clinics/me/time-blocks/{id}` | | 204 |
| GET/POST `/api/clinics/me/dentists` | POST `{ fullName, title?, bio?, sortOrder? }` | `{ dentists: … }` / 201; 429 `DENTIST_LIMIT` ved over 30 tandlæger |
| PATCH/DELETE `/api/clinics/me/dentists/{id}` | PATCH samme felter valgfri | dentist / 204 (sletter også portræt og portefølje) |
| POST/DELETE `/api/clinics/me/dentists/{id}/photo` | multipart `file` | `{ photoUrl }` (med `?v=`, 9.5) / 204 |
| POST `/api/clinics/me/portfolio` | multipart: `file`, `dentistId`, `serviceId?`, `caption?`, `patientConsentConfirmed: "true"`, `consentTextVersion` (læses med `readImageForm`; tekstfelterne valideres, før billedet behandles) | 201 portfolio item; 400 uden bekræftelse eller ved forkert `consentTextVersion`; 429 `PORTFOLIO_LIMIT` ved over 60 billeder pr. klinik |
| PATCH/DELETE `/api/clinics/me/portfolio/{id}` | PATCH `{ caption?, serviceId? }` | item / 204 |
| GET `/api/clinics/me/reviews` | | `{ reviews: ClinicReviewDto[] }` (10.13): godkendte anmeldelser af egen klinik med eget svar og dets status, via `clinic_reviews()`. 403 `CLINIC_NOT_VERIFIED` for ikke-verificerede. Bygget i 6.2 |
