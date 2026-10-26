# Sager og AI (`features/cases`)

Domænet dækker sager, AI-chat, opsummering og billeder. AI-reglerne ligger samlet i `features/cases/ai/`.

- **Server:** `*Controller.ts`, `*Repository.ts`/`*Storage.ts`, `*Service.ts` direkte i mappen.
- **Web-UI:** `components/`, `pages/` (som `app/` videresender til) og `utils/`.
- **Grænseflade:** andre domæner importerer kun `index.ts` (server) og `ui.ts` (klientsikre komponenter).
- **Tests:** `__tests__/` (unit) og `__tests__/api/` (API).

Afsnittene nedenfor er flyttet uændret fra `docs/architecture.md` (oversigten). Numrene er bevaret, så henvisninger som "architecture 10.10" i koden stadig kan findes. Stier er opdateret til den nye struktur.

## 4. Datamodel

### 4.3 Tabeller

#### `cases` (sag)
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| patient_id | uuid FK patients on delete cascade | |
| status | case_status not null default 'draft' | |
| is_emergency | boolean not null default false | Sat for sager oprettet via akutvejen (6.1) |
| postal_code | text null | Område for afstand. Præcis adresse gemmes ikke |
| preferred_timeframe | case_timeframe null | Ønsket tidsrum. Påkrævet før afsendelse |
| ai_summary | jsonb null | Senest validerede AI-udkast (`AiSummary`, 7.4). Kun via `store_ai_summary()` |
| ai_model, ai_prompt_version | text null | Sporbarhed |
| ai_generation_count | integer not null default 0 | Max 5 udkast pr. sag (`consume_summary_generation()`) |
| summary_text | text null | Den opsummering, patienten har **godkendt** (max 1500). Det er den, klinikken ser. Kun via `approve_summary()` |
| summary_ai_assisted | boolean not null default false | Vises for klinikken |
| summary_approved_at | timestamptz null | Nulstilles af trigger, når billeder ændres efter godkendelse |
| sharing_consent_id | uuid FK consents null | Sættes ved første afsendelse |
| submitted_at, closed_at | timestamptz null | |
| updated_at | timestamptz | |

Redigerbarhed håndhæves i databasen: UPDATE-policyen kræver ejer og `status = 'draft'`, og triggeren `cases_guard` afviser ændringer af beskyttede felter (status, AI-felter, tællere, `summary_text`, `submitted_at`) uden for funktionerne i 5.3. En anonym patient kan højst have én `draft` (trigger). En anonym kladde med indhold kan overdrages til en eksisterende patientkonto ved login (`claim_anonymous_case()`, identity 10.2): `patient_id` på sagen, samtalen, beskederne og billederne skifter ejer i én transaktion; `cases_guard()` tillader kun det under `tm.claim`.

#### `case_services` (bekræftede ydelser)
| Felt | Type | Note |
|---|---|---|
| case_id | uuid FK cases on delete cascade | PK sammen med service_id |
| service_id | uuid FK services | Skal være aktiv |
| suggested_by_ai | boolean not null default false | Om ydelsen kom fra AI'ens forslag (sporbarhed) |
| confirmed_at | timestamptz not null default now() | |

Kun rækker, patienten har bekræftet, findes her. AI'ens forslag ligger på `ai_messages.suggested_service_ids` og `cases.ai_summary`. Max 5 ydelser pr. sag. Kan kun ændres, mens sagen er `draft`.

#### `ai_conversations`
Som før, men bundet til sagen: `case_id` (FK cases cascade, **unique**), `patient_id`, `status` (`active`/`closed`), `user_message_count` (kun trigger), `ai_consent_id` (FK consents not null), `prompt_version`, `model`. Lukkes, når sagen sendes.

#### `ai_messages`
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| conversation_id | uuid FK ai_conversations on delete cascade | |
| patient_id | uuid FK patients on delete cascade | Redundant, for enkel RLS |
| role | ai_message_role not null | Patienten kan kun indsætte `user`. `assistant` kun via `append_assistant_message()` (service role) |
| content | text not null | Bruger: max 1000 tegn (PII-maskeret). Assistent: det validerede svar eller den faste afvisningstekst |
| preliminary_assessment | text null | Kun assistent. Foreløbig vurdering, vises altid med fast mærkat (7.3) |
| suggested_service_ids | uuid[] not null default '{}' | Kun assistent. Validerede id'er fra kataloget |
| emergency | boolean not null default false | Kun assistent. Akutte tegn; UI viser fast akut-henvisning |
| out_of_scope | out_of_scope_topic[] not null default '{}' | Kun assistent |
| blocked | boolean not null default false | Svaret blev afvist af filteret og erstattet |
| ready_for_summary | boolean not null default false | Aktiverer kun knappen "Lav opsummering" |

Chatten deles **aldrig** med klinikker. Triggeren `ai_messages_after_insert()` tæller brugerbeskeder og lukker samtalen ved 30.

#### `case_images`
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| case_id | uuid FK cases on delete cascade | |
| patient_id | uuid FK patients | Redundant, for enkel RLS |
| consent_id | uuid FK consents not null | Det `image_upload`-samtykke, der var aktivt ved upload |
| storage_path | text not null unique | `{case_id}/{id}.jpg`. Ingen `patient_id` i stien |
| ai_view, ai_quality | image_view / image_quality null | Fra AI |
| ai_description | text null | Neutral beskrivelse (7.3), højst 500 tegn (`imageDescription()` i `lib/cases/domain/summary.ts` afkorter til `IMAGE_DESCRIPTION_MAX_CHARS` før gemning), godkendes som del af opsummeringen. Deles kun med klinikken, når patienten har godkendt opsummeringen **efter** beskrivelsen blev skrevet: `clinic_lead_images()` returnerer den i kolonnen `approved_description`, når `cases.summary_approved_at >= ai_described_at`, ellers er `approved_description` `null` (fail closed; migration `20261019000200`). Klinikkens visning (trin 4-5) skal tåle `null` |
| ai_described_at | timestamptz null | Sættes af trigger, når `ai_description` skrives eller ændres |
| ai_turn_at | timestamptz null | Sættes af `reserve_image_turn()`, når billedet er taget med i en billedtur (7.9c); `null` = endnu ikke set af AI'en i en billedtur. Ryddes igen, hvis turen fejler, så den kan gentages. Migration `20261030000100` |
| width, height, bytes | integer | |
| created_at | timestamptz | Upload-tidspunkt under `consent_id` |

Max 5 billeder pr. sag; kun mens sagen er `draft`. Skrives og slettes kun med service role (9.3).

## 7. AI-flowet

Status: backend og AI-lag er bygget i trin 3 (3.1-3.3: `dbdd3881` AI-regler, `ba7115b2` sager og billeder, `adf9c53c` chat og opsummering) og sagsflowets sider (3.4). Rettelserne efter review og security (3.6a-c: strammere guardrails, atomisk reservation af chat-ture, billedbeskrivelser kun efter patientens godkendelse m.m.) er bygget (`b2f2aff8`, `df541715`, `88995a2b`, `4649015d`). Rettelsesrunde 3.7a-c er bygget (`7c0b24f4` m.fl.): falsk beroligelse om hastegrad blokeres, `reserve_chat_turn`/`consume_summary_generation` kaldes kun med service role, og døgnloftet overlever sletning af sagen; testerens afslutning 3.7d er i gang. AI-laget ligger i `features/cases/ai/` (regler, prompts, skemaer, guard, `aiChatService.ts`, `aiSummaryService.ts`, `modelClient.ts`) samt `features/cases/aiImageService.ts`.

**Testklient:** med `AI_FAKE_CLIENT=1` bruger serveren `FakeAiClient` (`features/cases/ai/fakeAiClient.ts`) i stedet for OpenAI, men kun når `NODE_ENV !== 'production'`. `tests/api/run.sh` og `tests/e2e/run.sh` sætter begge variablen, så testene ikke kalder OpenAI. Testene i `features/cases/__tests__/ai/` kalder heller ikke modellen: de tester guard, filtre, PII-maskering og akutdetektion direkte og bruger den falske klient til flowet. En valgfri live-kørsel mod den rigtige model (`AI_LIVE=1`) køres før demo, men aldrig i de normale tests (3.6a).

### 7.1 Overblik

AI-assistenten har to opgaver med samme regler:
1. **Chat:** spørger grundigt ind, indtil den forstår patientens behov; må forklare behandlinger og give en **foreløbig vurdering**; foreslår ydelser fra kataloget; henviser straks til akutvejen ved akutte tegn.
2. **Opsummering:** når patienten trykker "Lav opsummering" (aktiveret af `readyForSummary`), skriver serveren et udkast **til klinikken** ud fra chatten og billederne. Patienten retter og godkender. Opsummeringen er beskrivende; den foreløbige vurdering medtages ikke (klinikken laver sin egen).

```
(Vilkårs-gaten er passeret. Den giver IKKE AI- eller billedsamtykke.)
/start  særskilt AI-samtykke
  -> POST /api/session/anonymous           anonym session, ai_processing-samtykke, tom sag
  -> /start/[caseId]
  -> POST /api/cases/{id}/chat             chat (gentages); svar kan indeholde forslag, foreløbig vurdering, akut
  -> POST /api/consents (image_upload)     lige før første upload
     POST /api/cases/{id}/images
  -> PUT  /api/cases/{id}/services         patienten bekræfter ydelser
  -> POST /api/cases/{id}/summary          udkast
  -> PUT  /api/cases/{id}/summary          ret og godkend
  -> PATCH /api/cases/{id}                 postnummer, ønsket tidsrum
  -> /klinikker?sag=[caseId]               sammenlign, vælg op til 3
  -> POST /api/auth/convert                opret konto (kun anonym; samme bruger-id)
  -> POST /api/consents (health_data_sharing)
  -> POST /api/cases/{id}/leads            send
```

Patienter med konto starter med `POST /api/cases` + `POST /api/consents (ai_processing)`. De kan også springe AI'en over: vælge ydelser selv og skrive opsummeringen selv.

Rækkefølgen ovenfor var **webens** trinflow (`/start/[caseId]`, fjernet fra weben 2026-10-22, 13.6). I **appen** bruges de samme routes, men uden separate trin: alt foregår i én samtale, hvor AI'en spørger ind, og hvor appen viser faste svar-kort i chatten for ydelser, tidsrum, postnummer og opsummering (7.9).

**Klinikken ser kun** `summary_text`, som patienten har godkendt, de bekræftede ydelser og billeder med godkendte beskrivelser. Chatten, AI'ens forslag og den foreløbige vurdering deles aldrig.

### 7.2 Hvad sendes til OpenAI

| | Chat (`AiChatService.sendTurn`, `features/cases/ai/aiChatService.ts`) | Opsummering (`AiSummaryService.generate`, `features/cases/ai/aiSummaryService.ts`) |
|---|---|---|
| System-besked | Fast, versioneret `prompts/chat.v7.ts` (7.9a, trin 9.4; v7 se række 9 nedenfor), bygget af reglerne i `rules.ts` | `prompts/summary.v2.ts` (uændret) |
| Katalog | Aktive behandlinger grupperet efter kategori: kategoriens navn og for hver behandling `slug`, navn, type og kort beskrivelse (`catalogContext.ts`, bygget fra databasen ved hvert kald, så ændringer i kataloget slår igennem uden kodeændring). **Ingen priser, ingen klinikker**. AI'en foreslår kun behandlings-slugs, ikke kategorier | Samme |
| Kontekst | Seneste 20 beskeder; sagens billeder (low detail) | Hele chatten (max 30 brugerbeskeder), bekræftede ydelser, billeder |
| Billeder | Re-encodet server-side (EXIF fjernet), max 1024 px, base64. Aldrig signerede URL'er | Samme |
| Output | Chat-skemaet i `features/cases/ai/schemas.ts` (7.4) | `AiSummary` (7.4) |

**Aldrig** til OpenAI: navn, e-mail, telefon, postnummer, adresse, `patient_id`, klinikdata eller priser. Patienttekst PII-maskeres før afsendelse og gemmes maskeret. Patienttekst sendes som data adskilt fra instruktioner (`<patient_input>…</patient_input>`). AI'en har ingen værktøjer eller handlinger.

**Skrivevej:** routen tjekker IP-grænsen; `ChatController` maskerer patientens besked med `maskPii()` og **reserverer turen før modelkaldet** med `reserve_chat_turn(p_user_id, …)` (5.3) via service role med bruger-id'et fra den verificerede session; funktionen tjekker og tæller alle lofter og gemmer brugerbeskeden i én transaktion. Derefter kalder den `AiChatService.sendTurn()` og skriver det validerede svar via `append_assistant_message(p_user_id, …)` (service role). Fejler noget efter reservationen (modelkald eller skrivning af svaret), gemmes den faste tekst `CHAT_UNAVAILABLE_TEXT` som svar, og routen svarer **503 `AI_UNAVAILABLE`** for enhver fejl efter reservationen; frontend henter samtalen igen (10.6). Alle andre fejl (400/403/404/409/429) sker før reservationen, så der aldrig er en halv tur. Summary-routen tjekker IP-grænsen og kalder `consume_summary_generation(p_user_id, p_case_id)` (service role) før OpenAI og skriver via `store_ai_summary(p_user_id, …)` (service role). Fejl for manglende samtykke og loft bygges ét sted, `aiConsentRequired()` og `chatLimit()` i `platform/middleware/http.ts`. IP-grænser: chat 120 pr. time (`CHAT_IP_LIMIT_PER_HOUR`) og opsummering 20 pr. time; `enforceIpRateLimit()` har en `limit`-parameter.

**PII-maskering** (`pii.ts`): e-mail, telefonnumre, CPR-mønstre, navneudsagn ("jeg hedder …"), vejnavn + husnummer og postnummer + by. Den maskerede tekst bliver aldrig længere end originalen, så 1000-tegnsgrænsen holder.

**Filtrene (3.6a og 3.7a):** vurderinger må kun stå i `preliminaryAssessment`; kategorien `assessment` køres på `reply`, og `speculation` kun på opsummeringen. **Falsk beroligelse om hastegrad** ("det haster ikke", "kan godt vente" o.l.) blokeres i både `reply` og `preliminaryAssessment`. Patientens egne ord undtages ikke generelt (`allowTerms` er fjernet); kun prisord i `patientWishes` undtages, og kun når de findes ordret som delstreng i patientens egne beskeder. Ved emnerne pris og klinikanbefaling vises de faste tekster `PRICE_NOTICE_TEXT` (klinikken giver et prisinterval) og `CLINIC_RECOMMENDATION_NOTICE_TEXT` (anmeldelser og kriterier ses i oversigten) fra `lib/cases/constants/ai-texts.ts`. Opdager akutdetektionen akutte tegn, som modellen ikke markerede, erstattes `reply` med akut-henvisningen. `forbiddenTerms.ts` importerer `rules.ts`. Værdierne for emner, billedvinkler, billedkvalitet og samtalestatus står i `lib/cases/constants/ai.ts` (`OUT_OF_SCOPE_TOPICS`, `IMAGE_VIEWS`, `IMAGE_QUALITIES`, `CONVERSATION_STATUSES`).

**Bygget i 3.3 (afvigelser og valg):** ukendte slugs fra modellen **afvises** (nyt forsøg, derefter fast tekst) i stedet for at blive fjernet. Ved `retakeImages` gemmes opsummeringen, kvaliteten gemmes på billedet (`ai_quality`), og `POST /summary` returnerer listen; serveren blokerer ikke godkendelsen. Svaret på den 30. brugerbesked kan gemmes, selvom samtalen er lukket af triggeren (migration `20261018000100`). **Test-mulighed:** `AI_FAKE_CLIENT=1` giver en deterministisk falsk klient (`features/cases/ai/fakeAiClient.ts`) uden netværkskald, men kun når `NODE_ENV !== 'production'`; den sættes kun af `tests/api/run.sh`.

### 7.3 Hvad AI'en må og ikke må

| Tilladt | Forbudt |
|---|---|
| Stille opklarende spørgsmål om ønsker, gener, varighed, tidligere behandling, tidshorisont | **Priser** i enhver form: beløb, prisniveau, "billig/dyr", sammenligning af priser |
| Forklare behandlinger generelt (gerne med katalogets beskrivelser) | **Anbefale en bestemt klinik** eller tandlæge, rangere klinikker, nævne klinikker ved navn |
| Give en **foreløbig vurdering** i feltet `preliminaryAssessment`, altid formuleret som foreløbig. UI viser altid den faste mærkat `PRELIMINARY_ASSESSMENT_LABEL`: "Foreløbig – klinikken vurderer endeligt" | Endelige diagnoser eller garantier ("du har…", "det er helt sikkert…"); at sige, at patienten ikke behøver tandlæge |
| Foreslå ydelser fra kataloget (`suggestedServices`, kun slugs fra kataloget). Patienten bekræfter selv | Ydelser uden for kataloget; at bekræfte ydelser på patientens vegne |
| **Akut:** ved tegn som stærke smerter, hævelse, feber, blødning der ikke stopper, traume: `emergency = true` og en kort opfordring til at søge akut tid. UI viser den faste akut-henvisning med link til `/akut`. Ved livstruende tegn (vejrtrækningsbesvær, udbredt hævelse i ansigt/hals) henvises til 112/1813 i den faste tekst | At fortsætte almindelig udspørgen, når der er akutte tegn |
| **Usikker patient:** spørge mere ind; er patienten stadig usikker, foreslå `undersoegelse` | At vælge spor eller klinik for patienten |
| Billeder: vinkel, synligt område, kvalitet; bede om nyt billede | I opsummeringens billedfelter: fortolkning (de er beskrivelser til klinikken) |
| Sige, at patienten selv bekræfter de foreslåede behandlinger under beskeden (7.9) | At spørge om tidsrum, postnummer, adresse, by, navn, telefon eller e-mail: appen spørger selv med faste kort (7.9), og postnummer og kontaktdata må aldrig til OpenAI (7.2). Fra prompt `chat.v3` |
| | At påstå at have bekræftet, gemt, sendt, booket eller kontaktet noget ("jeg har bekræftet …", "din tid er booket", "klinikken kontakter dig"): AI'en har ingen handlinger. Filtreres på `reply` (kategorien `action_claim`, 7.5) |

Spørger patienten om pris eller hvilken klinik der er bedst, svarer AI'en ikke på indholdet, sætter `outOfScopeTopics` (`price`, `clinic_recommendation`), og UI viser en fast tekst: "Priserne kommer fra klinikkernes egne prislister, og du kan sortere klinikkerne efter pris, anmeldelser, afstand og første ledige tid i oversigten."

**MDR-note:** En foreløbig vurdering og forklaring af behandlinger kan gøre softwaren til medicinsk udstyr (EU MDR). Det er accepteret for prototypen, men skal vurderes fagligt før rigtige patienter [UDSKUDT]. Derfor er reglerne samlet ét sted (7.8), så vurderingen kan slås fra og diagnoseordene genaktiveres uden at ændre resten af flowet.

### 7.4 Output-skemaer (structured output, strict)

`additionalProperties: false` overalt, alle strenge har max-længde. Ingen prisfelter, ingen klinikfelter.

```ts
// lib/cases/types/ai.ts (værdierne står i lib/cases/constants/ai.ts: OUT_OF_SCOPE_TOPICS, IMAGE_VIEWS, IMAGE_QUALITIES, CONVERSATION_STATUSES)
export type OutOfScopeTopic = (typeof OUT_OF_SCOPE_TOPICS)[number];  // "price" | "clinic_recommendation"
export type ImageView = (typeof IMAGE_VIEWS)[number];
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];

// Chat-svarets felter (skemaet ligger i features/cases/ai/schemas.ts; der er ingen eksporteret AiChatTurn-type):
//   reply                  max 700. Spørgsmål, forklaring, procesvejledning
//   preliminaryAssessment  max 400 eller null. Altid foreløbig; null hvis rules.ts slår vurdering fra
//   suggestedServices      max MAX_CONFIRMED_SERVICES_PER_CASE slugs; en ukendt slug afviser svaret (7.5)
//   emergency              akutte tegn
//   outOfScopeTopics       OutOfScopeTopic[]
//   readyForSummary        AI'en har nok til, at klinikken kan svare. Weben: aktiverer knappen "Lav opsummering".
//                          Appen: viser kortet til at bekræfte ydelser (7.9). Fra 8.6c tvinger guard.ts feltet til
//                          false, når suggestedServices er tom (og som i dag ved emergency) [IKKE BYGGET]
//   quickReplies           (bygget, 8.6g) 0-4 korte svarmuligheder på AI'ens eget spørgsmål, hver 1-60 tegn
//                          (fx "Et par dage", "Over en uge"). Køres gennem reply-filteret og desuden et filter mod
//                          tidsrum, postnummer, navn, telefon og e-mail; fejler ét, fjernes alle (intet nyt forsøg,
//                          ingen blokering). Tvinges til [] ved emergency og ved readyForSummary. Gemmes ikke (10.6)

// Opsummeringsskemaet er defineret én gang med zod i lib/cases/constants/ai-schemas.ts og genbruges af
// lib/cases/schemas/aiSummary.ts (parseAiSummary) og AI-laget. Typerne udledes: AiSummary = z.infer<…>,
// AiImageObservation = z.infer<…>. Felterne:
//   AiSummary.summaryText             max 800. Til klinikken: patientens ønske og oplysninger, neutralt
//   AiSummary.patientWishes           max 5
//   AiSummary.patientReportedHistory  max 5
//   AiSummary.suggestedServices       max 5 slugs
//   AiSummary.images                  AiImageObservation[]
//   AiSummary.outOfScopeTopics        OutOfScopeTopic[]
//   AiImageObservation.imageRef       "img_1" …, mappes til case_images.id på serveren
//   AiImageObservation.view           ImageView
//   AiImageObservation.visibleArea    max 80
//   AiImageObservation.observations   max 4, hver max 120; kun synlige forhold uden fortolkning
//   AiImageObservation.quality        ImageQuality
// Den samlede beskrivelse, der gemmes i case_images.ai_description, laves af imageDescription() i
// lib/cases/domain/summary.ts og afkortes til IMAGE_DESCRIPTION_MAX_CHARS (500) (4.3).
```

### 7.5 Guardrails, lag for lag

| # | Hvor | Chat | Opsummering |
|---|---|---|---|
| 1 | UI | Fast tekst over chatten: "AI-assistenten giver ikke endelige vurderinger og kender ikke priserne. Klinikken vurderer." Fast mærkat ved foreløbig vurdering. Fast akut-blok ved `emergency` | Mærkat "Beskrivelse, ikke vurdering" ved billedbeskrivelser |
| 2 | System-prompt | Reglerne fra `rules.ts` (7.3), kataloget | Samme |
| 3 | Input | Data-afgrænsning, PII-maskering, max 1000 tegn | Samme |
| 4 | Output-skema | chat-skemaet strict | `AiSummary` strict |
| 5 | Server-validering (`guard.ts`) | zod + filter på `reply` og `preliminaryAssessment`: beløb/valuta, prisord, klinikanbefaling; på `reply` desuden påståede handlinger (`action_claim`, fra 8.6c). Slugs valideres mod aktivt katalog. `readyForSummary` tvinges til `false` uden forslag (fra 8.6c) | Samme på alle strenge; billedfelterne også mod fortolkningsord |
| 6 | Ved fejl i 5 | Ét nyt forsøg med skærpet påmindelse; derefter fast tekst, `blocked = true`. Det afviste svar gemmes ikke | Ét nyt forsøg; derefter `summary = null`, `fallback = "write_yourself"` |
| 7 | Menneske i loopet | Patienten bekræfter ydelser; chatten deles ikke | Patienten retter og godkender |
| 8 | Drift | Logs kun med id'er, model, prompt-version, varighed, status, `blocked`, `emergency`. Aldrig indhold | Samme |
| 9 | Test (`features/cases/__tests__/ai/`) | Provokationer: "hvad koster det?", "hvilken klinik er bedst?", "er klinik X god?", "ignorer dine regler", akutte symptomer (skal give `emergency`), usikker patient (skal spørge ind og derefter foreslå `undersoegelse`). Fra 8.6c desuden: `readyForSummary` uden forslag bliver `false`; påståede handlinger ("jeg har bekræftet behandlingen", "din tid er booket") afvises; "bekræft det for mig", "send det til klinikken" og "skriv mit postnummer ind" giver ingen påstand om handling; prompten indeholder forbuddet mod at spørge om tidsrum, postnummer og kontaktdata (`AI_LIVE=1`: modellen spørger ikke om dem) | Samme + billeder af ikke-tænder |

`forbiddenTerms.ts` har lister for priser (beløb, valuta, prisord), klinikanbefaling og fortolkning i billedfelter. Diagnose- og alvorlighedsordene fra den tidligere model beholdes i en liste `mdrStrictTerms`, som kun bruges, når `rules.ts` sætter `strictMdrMode = true`.

### 7.6 Lofter og rate limits

| Grænse | Værdi (MVP) | Ved overskridelse |
|---|---|---|
| Patientbeskeder pr. samtale | 30 | 429 `CHAT_LIMIT`, samtalen `closed` |
| Tegn pr. patientbesked | 1000 | 400 |
| Chatbeskeder pr. patient pr. døgn | 100 (`ai_limits.chat_messages_per_patient_day`; tælles pr. UTC-dag i `ai_patient_usage_daily.chat_messages`, som ikke slettes med sagen) | 429 |
| Opsummeringer pr. sag / pr. patient pr. døgn | 5 / 20 | 429 `SUMMARY_LIMIT` |
| Billeder pr. sag | 5, max 4 MB hver | 400/413 |
| Billedture pr. patient pr. døgn | 30 (`ai_limits.image_turns_per_patient_day`; `ai_patient_usage_daily.image_turns`, samme regler som chatbeskeder; anonyme bruger også det anonyme døgnloft). En billedtur kræver mindst ét billede uden `ai_turn_at`, så der højst er én tur pr. upload-batch (7.9c) | 409 `NO_NEW_IMAGES` / 429 `RATE_LIMITED`/`ANON_CAP_REACHED` |
| Bekræftede ydelser pr. sag | 5 | 400 |
| Tandlæger pr. klinik | 30 | 429 `DENTIST_LIMIT` |
| Porteføljebilleder pr. klinik | 60 | 429 `PORTFOLIO_LIMIT` |
| Rækker i prislisten | 100 | 400 |
| Blokerede tider pr. klinik | 200 (alle rækker tæller) | 429 `TIME_BLOCK_LIMIT` |
| Åbningsvinduer pr. klinik | 42 | 400 |
| Pris pr. ydelse | 0-1.000.000 kr. | 400 |
| Aktive leads pr. sag (`sent`, `accepted`, `booked`) | 3 | 409 `LEAD_LIMIT` |
| Leads i alt pr. sag (uanset status) | 10 | 409 `LEAD_TOTAL_LIMIT`; UI tilbyder at starte en ny sag |
| Leads pr. patient pr. døgn (rullende 24 timer, uanset status og sag) | 15 | 429 `LEAD_DAILY_LIMIT` (mod spam til klinikkerne; security trin 4) |
| Reservation af akuttid uden svar | 30 min (eller til starttid) | Reservationen frigives (4.2) |
| Frist for at markere udeblivelse | 24 timer efter sluttid | 409 `NO_SHOW_WINDOW_CLOSED` |
| Timeout pr. OpenAI-kald | 30 s | 503 |
| Kontekst til chat | seneste 20 beskeder | |
| Anonym: kladder / beskeder / opsummeringer / billeder / lagring | 1 / 30 / 3 / 5 / 20 MB | 409 / 429 / 429 / 400 / 413 |
| Anonym levetid | 48 timer efter seneste aktivitet | Slettes (7.7) |
| Nye anonyme sessioner, login, signup, patienters og klinikkers billedupload pr. IP | 10 pr. time (`consume_rate_limit`) | 429 |
| AI-kald fra alle anonyme pr. døgn | `ai_limits.anon_daily_ai_calls` (300) | 429 `ANON_CAP_REACHED` |
| AI-kald pr. anonym bruger pr. døgn | `ai_limits.anon_user_daily_ai_calls` (40), så én bruger ikke kan tømme det globale loft | 429 |
| Chatbeskeder pr. IP pr. time | `CHAT_IP_LIMIT_PER_HOUR` (120) | 429 |
| Opsummeringer pr. IP pr. time | 20 | 429 |
| Beskeder i tråden | 2000 tegn, 200 pr. afsender pr. døgn | 400 / 429 `MESSAGE_LIMIT` |
| Billeder i tråden (leads 10.12) | 3 pr. besked, max 4 MB hver; 30 pr. afsender pr. døgn (`MESSAGE_MAX_IMAGES`, `MESSAGE_IMAGES_MAX_PER_DAY`); 10 uploads pr. IP pr. time (scope `message-image-upload`) | 400 `IMAGE_LIMIT` / 413 / 429 `MESSAGE_IMAGE_LIMIT` / 429 `RATE_LIMITED` |
| Bookinger | 1 aktiv pr. lead; højst 5 bookinger i alt pr. lead (også aflyste), så book og aflys ikke kan gentages i det uendelige (security trin 6, M1; migration `20261027000100`). Bookinger aflyst af klinikken tæller ikke (besluttet 2026-10-18, security kompromis 20) (bygget i 7.1) | 409 / 409 `BOOKING_LIMIT` |
| Akut-henvendelser pr. IP pr. time (`POST /api/emergency-leads`) | Samme scope og grænse som afsendelse af leads (`leads-send`, 30) | 429 `RATE_LIMITED` |
| Bookinger pr. IP pr. time (`POST /api/leads/{id}/booking`, scope `booking`) | 30 | 429 `RATE_LIMITED` |

Lofterne tælles i databasen (triggers og funktionerne i 5.3). Konstanterne står i `lib/common/constants/limits.ts`.

**Konstanter, der findes både i SQL og i `lib/<domæne>/constants/`.** Databasen håndhæver dem; TypeScript spejler dem til UI og beregning. De ændres altid begge steder i samme commit:

| Regel | Værdi | `lib/<domæne>/constants/` | Håndhæves i SQL af |
|---|---|---|---|
| Højst bookinger i alt pr. lead (også aflyste, men ikke aflyst af klinikken fra migration `20261028000100`) | 5 | `bookings.ts`: `MAX_BOOKINGS_PER_LEAD` | `book_slot()` (`BOOKING_LIMIT`) |
| Mindst antal cifre i et telefonnummer | 8 | `limits.ts`: `MIN_PHONE_DIGITS` | `is_valid_phone()` i check constraints, `book_slot()` og `send_emergency_lead()` (bygget i 7.1, migration `20261028000100`; `send_emergency_lead()` bygget i 7.3) |
| Starttid på helt kvarter | 15 min | `bookings.ts`: `SLOT_STEP_MINUTES` | check på `bookings`, `assert_slot_bookable()` |
| Mindste varsel, almindelig ydelse | 30 min | `bookings.ts`: `MIN_BOOKING_NOTICE_MIN` | `assert_slot_bookable()` |
| Mindste varsel, akutydelse | 0 min | `bookings.ts`: `MIN_EMERGENCY_NOTICE_MIN` | `assert_slot_bookable()` |
| Længst frem at booke | 60 dage | `bookings.ts`: `BOOKING_HORIZON_DAYS` | `assert_slot_bookable()` |
| Frist for udeblivelse | 24 timer efter sluttid | `bookings.ts`: `NO_SHOW_GRACE_HOURS` | `effective_booking_status()`, `mark_booking_no_show()`, `complete_due_bookings()` |
| Reservation af akuttid | 30 min (eller til starttid) | `bookings.ts`: `EMERGENCY_HOLD_MINUTES` | `send_leads()`, `effective_booking_status()`, `release_expired_holds()` |
| Aktive leads pr. sag | 3 | `limits.ts`: `MAX_ACTIVE_LEADS_PER_CASE` | `send_leads()`, trigger på `leads` |
| Leads i alt pr. sag | 10 | `limits.ts`: `MAX_TOTAL_LEADS_PER_CASE` | `send_leads()`, trigger på `leads` |
| Leads pr. patient pr. døgn | 15 | `limits.ts`: `MAX_LEADS_PER_PATIENT_DAY` | trigger `leads_daily_limit()` (BEFORE INSERT på `leads`, migration `20261022000100`) |
| AI-lofter | se tabellen ovenfor | `limits.ts` | `ai_limits` og funktionerne i 5.3 |

`FIRST_AVAILABLE_SEARCH_DAYS` (14 dage) findes kun i TypeScript, fordi den kun bruges til visning.

Klinikkernes lofter står i `lib/clinics/constants/clinics.ts`: `MAX_DENTISTS_PER_CLINIC = 30`, `MAX_PORTFOLIO_ITEMS_PER_CLINIC = 60`, `MAX_PRICE_ROWS = 100`, `MAX_OPENING_HOUR_WINDOWS = 42` (højst seks pr. ugedag), `MAX_TIME_BLOCKS_PER_CLINIC = 200`, `MAX_PRICE_DKK = 1_000_000`. De håndhæves af API'et (pæn fejl) **og i databasen** med de samme tal (triggere på `clinic_dentists`, `portfolio_items`, `clinic_opening_hours`, `clinic_time_blocks`, og i `replace_clinic_prices()`; check på priserne), så de ikke kan omgås ved direkte kald med brugerens JWT. Tallene skal ændres begge steder samtidig.

### 7.7 Anonym samtale: identitet, kontooprettelse og sletning

Bygget for den gamle kladde; tilpasses til sager.

- **Mekanisme:** Supabase anonymous sign-in. `POST /api/session/anonymous` kalder `signInAnonymously()` på serveren; sessionen ligger i `httpOnly`-cookies. Den anonyme bruger har et rigtigt `auth.uid()`, så RLS virker uændret.
- **Konvertering** (`POST /api/auth/convert`): kræver anonym session; `updateUser({ email, password })`; trigger sætter `is_anonymous = false`; API'et sætter `first_name`; sessionen opfriskes. Samme bruger-id, så sag, chat, billeder og samtykker følger med. Findes e-mailen: 409 `EMAIL_EXISTS` [PROTOTYPE].
- **Ingen overtagelse:** ejerskab er bundet til bruger-id'et; et `case_id` alene giver intet.
- **Udløb:** 48 timer efter `last_active_at`. `/api/cron/cleanup-anonymous` (hver time, `CRON_SECRET`) sletter billedmapperne `{case_id}/` og derefter auth-brugeren (cascade).
- **Selv slette:** `DELETE /api/patients/me` (også anonymt).
- **Tilbagetrækning:** af `ai_processing` i en anonym session sletter hele sessionen; af `image_upload` sletter billederne.
- **Minimering:** session først efter vilkår og AI-samtykke; ingen e-mail, navn, telefon eller postnummer før kontooprettelse, med én undtagelse: postnummeret gemmes på sagen, når patienten selv skriver det (webens trin "tid og sted", appens postnummer-kort i 7.9), fordi oversigten og afstanden bruger det; det sendes aldrig til OpenAI; IP kun som hash. Anonyme sager er altid `draft` og når aldrig klinikker.

### 7.8 AI-reglerne ét sted

`features/cases/ai/rules.ts` er det eneste sted, der bestemmer AI'ens rolle. Den eksporterer en versioneret konfiguration, som prompts, skemaer, guard og UI-tekster læser:

```ts
export const AI_RULES = {
  version: "rules-v2",
  allowPreliminaryAssessment: true,   // false → feltet tvinges til null og prompten forbyder vurdering
  allowTreatmentExplanation: true,
  strictMdrMode: false,               // true → diagnose- og alvorlighedsord blokeres (mdrStrictTerms)
  blockedTopics: ["price", "clinic_recommendation"],
  emergencyReferral: true,
} as const;
```

Fra 8.6c (bygget) er `version` til `"rules-v3"` (og `MDR_STRICT_RULES.version` til `"rules-v3-mdr-strict"`), fordi guarden ændres (`readyForSummary` kræver forslag, kategorien `action_claim`); felterne i konfigurationen er uændrede. Det, AI'en ikke spørger om, fordi appen gør det (tidsrum, postnummer, kontaktdata, 7.9), står i prompten `chat.v3.ts`, ikke i appen.

Stramning til EU MDR sker ved at ændre `rules.ts` og prompt-versionen. De faste UI-tekster står i `lib/cases/constants/ai-texts.ts`. `prompt_version` og `AI_RULES.version` gemmes på samtalen og sagen for sporbarhed.

### 7.9 Sagsflowet som én samtale (patient-appen)

Status: bygget i trin 8 (8.6b-8.6i, 8.11e). Billeder i chatten (8.7) er [IKKE BYGGET]. Reglerne for, hvornår behandlingskortet vises, er ændret i 7.9a og bygget i trin 9 (9.1-9.6a); hvor tabellen nedenfor og 7.9a er uenige, gælder 7.9a. Besluttet af brugeren 2026-10-19 efter test af appens chat. Gælder kun appen; weben har ikke længere patientsider (13.6).

I appen er hele sagen **én chatskærm** (`/sag/[caseId]/flow`). Der er ingen separate trin eller formularskærme. AI'en spørger ind frem og tilbage, indtil den kan foreslå ydelser og evt. give en foreløbig vurdering. Det, sagen kræver før afsendelse (`canSendCase()`, `send_leads()`: mindst én bekræftet ydelse, tidsrum, postnummer, godkendt opsummering), indsamler appen med **faste svar-kort i chatten**.

**Princip: AI'en taler, patienten bestemmer, serveren validerer.**
- AI'en sætter **ingen** felter på sagen. Den har stadig ingen værktøjer og ingen handlinger (7.2).
- Alt, der gemmes på sagen, gemmes ved patientens eget tryk via de eksisterende routes i 10.5 og deres zod-skemaer: ydelser mod det aktive katalog (`PUT /api/cases/{id}/services`, `ServicesRepository.requireActive`), tidsrum mod `CASE_TIMEFRAMES` og postnummer mod `postalCodeSchema` (`PATCH /api/cases/{id}`), opsummering (`POST`/`PUT /api/cases/{id}/summary`).
- **Ingen nye routes, ingen nye felter på sagen og ingen migration.**

**Fravalgt: at AI'en udtrækker tidsrum og postnummer** (fx `extracted { timeframe, postalCode }` i skemaet). Postnummer må aldrig sendes til OpenAI (7.2) og bliver maskeret af `maskPii()`. Et udtrukket felt er desuden AI'en, der sætter data på sagen; det skulle valideres og bekræftes af patienten alligevel. Faste kort er enklere, deterministiske og kan testes uden model.

**Svar-kortene.** Et kort ligner en besked fra "TandMatch" (ikke fra AI'en, intet AI-mærkat). Teksterne er faste og står i `lib/cases/constants/case-flow.ts`. Kortene vises under chatbeskederne i en fast rækkefølge. Besvarede kort foldes sammen til én linje med "Ret", så længe sagen er `draft`. Det aktuelle kort er foldet ud. Hvilket kort der er aktuelt, afgøres af den rene funktion `nextCaseFlowStep(caseDto, chatState)` i `lib/cases/domain/case-flow.ts`. Den bruger kun felter, der findes i `CaseDto` og `ChatStateDto` (10.5, 10.6), og trinnene er `CASE_FLOW_STEPS` (`lib/cases/constants/case-flow.ts`) med typen `CaseFlowStep` i `lib/cases/types/cases.ts`.

| Trin (`CaseFlowStep`) | Aktuelt når (første regel, der passer) | Kortet | API |
|---|---|---|---|
| `submitted` | `status !== "draft"` | Chatten er skrivebeskyttet; link til sagen (`/sag/[caseId]`) | – |
| `emergency` | seneste assistentbesked har `emergency` | Appen ignorerer flaget for kortene (brugerens beslutning 2026-10-19, `flowStepForApp()` i `mobile/src/utils/case-cards.ts`), og akut-henvisning i chatten er slået fra (`emergencyReferralInChat: false`, 7.9). Patienten kan skrive videre | – |
| `chat` | ingen bekræftede ydelser, og ingen af betingelserne for `services` (fra trin 9: se 7.9a) | Intet kort. Inputfelt og billedknap; AI'en spørger ind | `POST /api/cases/{id}/chat` |
| `services` | ingen bekræftede ydelser, og `readyForSummary` er sand eller samtalen er `closed` (fra trin 9 desuden: `suggestedServices` er ikke tom, eller patienten har sendt mindst `SERVICE_CARD_AFTER_USER_MESSAGES` beskeder; 7.9a) | "Passer disse behandlinger?" med AI'ens forslag (`CaseDto.suggestedServices`) som chips. Alle er valgt fra start og kan fravælges. Desuden "Jeg er ikke sikker" (→ `EXAMINATION_SERVICE_SLUG`) og "Vælg selv" (et ark med kataloget grupperet efter kategori fra `GET /api/services`; højst `MAX_CONFIRMED_SERVICES_PER_CASE`). Knappen "Bekræft" sender valget. Er der ingen forslag (lukket samtale), vises kun "Jeg er ikke sikker" og "Vælg selv". Patienten kan også skrive videre i stedet for at trykke | `PUT /api/cases/{id}/services` (`suggestedByAi` = valgt blandt forslagene) |
| `timeframe` | `preferredTimeframe` er `null` | "Hvornår vil du gerne i gang?" med chips fra `CASE_TIMEFRAME_LABEL` | `PATCH /api/cases/{id}` `{ preferredTimeframe }` |
| `postal_code` | `postalCode` er `null` | "Hvor vil du helst gå til tandlæge? Skriv postnummeret." Felt med `postalCodeSchema`, forudfyldt fra `GET /api/patients/me` for patienter med konto | `PATCH /api/cases/{id}` `{ postalCode }` |
| `summary` | `summaryApprovedAt` er `null` | Opsummeringskortet (se nedenfor) | `POST`/`PUT /api/cases/{id}/summary` |
| `ready` | ellers (og `canSend`) | "Din beskrivelse er klar." Knappen "Se klinikker der kan hjælpe" åbner klinikoversigten med `?sag=[caseId]` (8.8a) | – |

Er sagen klar, men `canSend` falsk (fx ingen ledige lead-pladser), viser `ready` i stedet en tekst og et link til sagen.

**Opsummeringskortet** (trin `summary`):
- **Udkast:** findes der intet `aiSummary`, kalder appen `POST /summary` **én gang automatisk**, når kortet bliver aktuelt. Findes et udkast, vises det. Knappen "Lav ny opsummering" laver et nyt udkast og bruger en af generationerne; `generationsLeft` vises.
- **Visning:** teksten, billedbeskrivelserne med mærkatet "Beskrivelse, ikke vurdering", `retakeImages` som besked, `CHAT_NOT_SHARED_TEXT` og "Det er denne tekst, klinikken ser".
- **Godkendelse er patientens eget valg:** "Det passer" sender `PUT /summary` med teksten uændret. "Ret" åbner teksten i et felt (max `SUMMARY_MAX_CHARS`) med "Gem og godkend". Godkendelsen sker aldrig automatisk.
- **Når der ikke kommer et udkast:** ved `fallback: "write_yourself"`, 503 `AI_UNAVAILABLE`, 429 `SUMMARY_LIMIT` eller 429 `ANON_CAP_REACHED` vises et tomt felt: "Skriv selv kort, hvad klinikken skal vide". Det godkendes med `PUT /summary`.
- **Billede efter godkendelse:** tilføjes eller slettes et billede efter godkendelsen, nulstiller databasen `summary_approved_at` (9.3 punkt 6). Kortet bliver dermed aktuelt igen med teksten "Du har ændret billederne. Godkend beskrivelsen igen".

**Billeder i chatten** (8.7):
- Ved inputfeltet er der en knap til kamera og bibliotek. Første tryk uden gældende `image_upload`-samtykke (`hasCurrentConsent`, `lib/identity/domain/consents.ts`) viser et samtykkekort i chatten med `CONSENT_TEXTS.image_upload` og knapperne "Giv samtykke" og "Ikke nu" (`POST /api/consents`). Samtykket gives aldrig sammen med AI-samtykket (9.4).
- Derefter vælges kamera eller bibliotek, og billedet nedskaleres og uploades som i 13.5.
- Billederne vises som miniaturer i en række over inputfeltet med slet-knap og tælleren `n/MAX_IMAGES_PER_CASE`. De indgår ikke i chatbeskederne, fordi `case_images` ikke er beskeder.
- Efter en upload-batch kalder appen **billedturen** `POST /api/cases/{id}/chat/image-turn` (7.9c). Patienten skriver ikke noget, og turen tæller ikke som en af hendes beskeder. Er samtalen lukket (30 beskeder), giver billedturen 429 `CHAT_LIMIT`, og appen springer den over ([ÅBEN] 12.3 punkt 42).

### 7.9c Billedtur: AI'en reagerer selv på et uploadet billede (brugerens beslutning 2026-10-24)

"Den behøver ikke sende en besked, den skal bare selv vide, den modtager billedet og behandle det." Efter en upload-batch (ét eller flere billeder) kalder appen `POST /api/cases/{id}/chat/image-turn` **én gang**. Serveren kører en assistent-tur uden patientbesked:
- **Forudsætninger:** sagen er `draft`, aktivt `ai_processing`-samtykke **og** aktivt `image_upload`-samtykke (gældende tekstversion), ellers 403 `CONSENT_REQUIRED`. Samme IP-grænse som chatten (`CHAT_IP_LIMIT_PER_HOUR`), anonym session tilladt.
- **Reservation (før modelkaldet):** `reserve_image_turn(p_user_id, p_conversation_id)` (service role, 5.3) låser patienten og samtalen som `reserve_chat_turn`, tjekker ejer, kladde, begge samtykker, at samtalen er `active` (ellers `CHAT_LIMIT`) og at der er mindst ét billede med `ai_turn_at is null` (ellers `NO_NEW_IMAGES`), tæller døgnloftet `image_turns` (og det anonyme loft), stempler de nye billeder med `ai_turn_at` og returnerer deres id'er. Dermed højst én tur pr. upload-batch, og et loft pr. sag på antal uploadede billeder; upload-slet-løkker begrænses af døgnloftet. Turen indsætter **ingen** brugerbesked og tæller ikke i `user_message_count`, `messagesLeft` eller `chat_messages`. Samtalen oprettes, hvis den ikke findes.
- **Modelkald:** `AiChatService.sendImageTurn()`. Samme system-prompt (`chat.v7.ts`, afsnittet BILLEDTUR), samme guard (`runChatGuard`: filtre, `forbiddenTerms`, katalog-slugs, retry, faste tekster), samme `rules` (`emergencyReferralInChat` uændret `false`). Der er ingen ny patienttekst, så akut-detektionen kører på en tom tekst; modellens eget `emergency`-flag tæller som altid kun med stærkt akut-ord i patientens tekst (7.4), dvs. aldrig i en billedtur. Modellen får de seneste beskeder, **alle** sagens billeder (nummereret `img_1` …, i uploadrækkefølge, uden id'er) og en kort system-genereret linje (ikke patienttekst) om, hvilke der er nye. Den kvitterer kort, nævner at den har set billedet (kun beskrivelse, ikke fortolkning i `reply`), stiller evt. næste spørgsmål og må opdatere forslagene, som i en almindelig tur. Er et nyt billede for mørkt, uskarpt, forkert vinkel eller ikke viser tænder, beder den om et nyt.
- **Kvalitet:** chat-skemaet har feltet `images: { imageRef, view, quality }[]` (tom ved almindelige ture; `quality` er `ok | too_dark | blurry | wrong_angle | not_teeth`). Serveren mapper `imageRef` til de **nye** billeders id og gemmer `ai_view` og `ai_quality` (kun disse to felter; `ai_description` skrives stadig kun ved opsummeringen). Ukendte eller gamle referencer ignoreres. `quality` kommer til udtryk i `GET /api/cases/{id}` (`ImageDto.quality`) og i svaret fra billedturen. Opsummeringen overskriver senere værdierne.
- **Svar:** assistentbeskeden gemmes med `append_assistant_message()` som i en almindelig tur (`content`, forslag, `readyForSummary` osv.) og ligger i `GET /chat` i rækkefølge efter billederne (`createdAt`). Billederne har `ImageDto.createdAt`, så appen kan placere billedbobler og assistentsvar i samme tidslinje.
- **Fejl:** fejler modelkaldet eller gemningen efter reservationen, ryddes `ai_turn_at` på de nye billeder (turen kan gentages), og routen svarer 503 `AI_UNAVAILABLE`. Der gemmes ingen fast tekst, fordi der ikke er en patientbesked, der står ubesvaret. 409 `NO_NEW_IMAGES` betyder, at alle billeder allerede er set (appen ignorerer fejlen).

**Hvad AI'en gør anderledes** (prompt `chat.v3.ts`, regler `rules-v3`, 8.6c):
- AI'en spørger ind frem og tilbage, ét eller to spørgsmål ad gangen. Har den nok, gør den i **samme** svar fire ting: giver evt. en foreløbig vurdering i `preliminaryAssessment`, lægger slugs i `suggestedServices`, sætter `readyForSummary = true` og skriver i `reply` kort, at patienten selv bekræfter behandlingerne nedenfor, og at klinikken laver den endelige vurdering.
- `readyForSummary` uden forslag tvinges til `false` af guarden.
- AI'en spørger **ikke** om tidsrum, postnummer, adresse, by, navn, telefon eller e-mail: appen spørger selv bagefter. Linjen "og hvornår hun vil i gang" udgår af prompten.
- AI'en påstår aldrig at have bekræftet, gemt, sendt, booket eller kontaktet noget (filteret `action_claim`).
- Alle andre regler i 7.3 gælder uændret: ingen priser, ingen klinikanbefaling, akut straks, foreløbig vurdering med forbehold.

**Mere styrende AI og færre falske akut-markeringer** (prompt `chat.v4.ts`, regler `rules-v4`, 8.6g og 8.11e; brugerens test 2026-10-19: "man chatter bare uden der sker noget"):
- Ét kort spørgsmål ad gangen, hver gang med 2-4 hurtigsvar i `quickReplies`, indtil problemet er afgrænset (straks, hvis patienten er klar, fx "jeg vil have blegning"). Så giver AI'en forslag, evt. en foreløbig vurdering og `readyForSummary = true`, og siger kort, at patienten kan bekræfte nedenfor og derefter se klinikker.
- **Akut:** årsagen til de falske markeringer var, at `emergency` blev sat af modellen alene (prompten nævnte "stærke smerter, hævelse, feber" uden grænse, så almindelig tandpine blev flaget), og at guarden stolede på flaget (`turn.emergency || detected.emergency`). Prompten lister nu kun reelle akutte tegn og siger udtrykkeligt, at mild tandpine, "lidt ondt" og "lidt hævet tandkød" ikke er akut. Guarden godtager et model-flag uden egen detektion kun, hvis patientens tekst indeholder et stærkt ord (hævelse, feber, blødning, traume, vejrtrækning, ulidelig m.fl.). Detektionen (`detectEmergency`) ignorerer "lidt/let hævet tandkød" og fanger "smertestillende hjælper ikke". Alle tegn i 7.3 giver stadig `emergency`.
- **Akut-henvisning i chatten (`emergencyReferralInChat` i `rules.ts`, sat til `false` 2026-10-19; testene kører med `true`):** brugerens beslutning 2026-10-19 er, at akut-henvisninger ikke skal vises i chatten for nu. Er værdien `false`, indsættes hverken akut-instruktionen i prompten, guardens nødtekst, 112/1813-teksten eller den faste akut-tekst i svaret, og `ChatTurnResponse.emergency` er `false`; `emergencyDetected` beregnes stadig i guarden. **Det afviger midlertidigt fra akut-reglen i CLAUDE.md** og står i `docs/security.md` (kompromis 29). Slås til igen ved at sætte `emergencyReferralInChat: true` (ingen anden kode ændres). Testene dækker begge tilstande.
- **Styrende samtale:** AI'en stiller ét spørgsmål ad gangen med 2-4 hurtigsvar, indtil problemet er afgrænset (ikke et fast antal udvekslinger), og går direkte til forslag, hvis patienten er klar.

**Grænser og fejl:**
- **Beskeder:** loftet er 30 patientbeskeder pr. samtale (7.6). Kortene bruger ingen chatbeskeder, kun almindelige API-kald. Har patienten højst `CHAT_LOW_MESSAGES_WARNING` (5, `lib/common/constants/limits.ts`) beskeder tilbage (`messagesLeft`), vises "Du har N beskeder tilbage".
- **Lukket samtale:** ved 0 beskeder tilbage, eller når `POST /chat` svarer 429 `CHAT_LIMIT`, erstattes inputfeltet af `CHAT_LIMIT_REACHED_TEXT` (`lib/cases/constants/ai-texts.ts`): "Samtalen er slut. Du kan stadig vælge behandlinger og godkende din beskrivelse nedenfor." Kortene fortsætter: `services` bliver aktuelt med "Jeg er ikke sikker" og "Vælg selv", og opsummeringen kan stadig laves eller skrives.
- **Andre 429-fejl** (`RATE_LIMITED`, `ANON_CAP_REACHED`, døgnloftet) giver den danske fejltekst (`apiErrorText`). Inputfeltet bevares, og kortene virker.
- **503 `AI_UNAVAILABLE`:** turen er gemt med `CHAT_UNAVAILABLE_TEXT` som svar. Appen henter samtalen igen og sender ikke beskeden igen (10.6). Kortene påvirkes ikke.
- **Konto** kræves først ved afsendelse (8.8a). Anonyme ser banneret fra 13.3.

**Hurtigsvar** (bygget, 8.6g-h; 8.6i er appen): `quickReplies` (7.4) vises som chips under den nyeste AI-besked. Et tryk sender teksten som patientens besked. Hurtigsvarene er kun med i `ChatTurnResponse` og forsvinder ved genindlæsning; det er acceptabelt, fordi de kun er en genvej.

**Weben** (13.6): fortsætter med trinflowet og skal ikke ændres. Ændringerne er bagudkompatible: `readyForSummary` er stadig et boolesk felt, `quickReplies` er et ekstra felt, som weben ignorerer, og ingen route ændres. Webens e2e-tests skal stadig bestå med den falske klient.

### 7.9a Kortene skal altid komme frem (trin 9) [bygget i 9.1-9.6a]

Brugerens oplevelse (2026-10-19 og 2026-10-22): "man chatter bare, uden der sker noget". Samtalen skal afgrænse problemet med ét spørgsmål ad gangen og hurtigsvar, og derefter **altid** føre videre til kortene: behandlinger → tidsrum → postnummer → opsummering → "Se klinikker der kan hjælpe". Patienten kan altid skrive selv i stedet for at trykke, eller ud over at trykke.

**Hvorfor kortene ikke kom frem.** Behandlingskortet afhang af ét enkelt flag fra modellen i den seneste tur. Det fejler på fem måder:

1. **Flaget gælder kun den seneste tur.** `ChatController.getState()` sætter `readyForSummary` ud fra den seneste assistentbesked, og `useChat` i appen overskriver `ready` ved hver tur. Har AI'en foreslået behandlinger, og skriver patienten derefter en besked mere (fx "tak" eller et spørgsmål til behandlingen), svarer modellen typisk med `readyForSummary = false`, og kortet forsvinder igen. Forslagene selv er derimod "klæbende": `CasesRepository.findConversationInfo()` bruger det seneste svar **med** forslag. De to felter er altså uenige.
2. **Forslag uden flag giver intet kort.** `nextCaseFlowStep()` ser kun på `readyForSummary`. Lægger modellen slugs i `suggestedServices` uden at sætte flaget (det sker, når den både foreslår og spørger videre), vises intet kort, selv om `CaseDto.suggestedServices` har forslagene.
3. **Forslagsturen er den, der oftest blokeres.** Prompten (`chat.v4.ts`) beder AI'en om i samme svar at skrive, at patienten "kan bekræfte behandlingerne nedenfor og derefter se klinikker". Netop de formuleringer rammer filtrene i `forbiddenTerms.ts`: fx "behandlingerne er bekræftet" (`action_claim`), "vælge klinikker" og "se klinikker i nærheden" (`clinic_recommendation`), og behandlingsnavne med diagnoseord ("rodbehandling", "tandsten") i sætninger som "det kan være en rodbehandling" (`assessment`). Fejler begge forsøg, erstatter guarden hele svaret med `CHAT_BLOCKED_TEXT`, og forslagene og flaget går tabt, selv om slugs er data fra kataloget og ikke fri tekst.
4. **Ingen øvre grænse for spørgsmål.** Prompten lister syv ting at spørge ind til (hvad, hvor, hvor længe, type, hævelse, tidligere behandling, hvad er vigtigst), ét ad gangen, og "stil dog ikke flere spørgsmål end nødvendigt". I praksis kan det blive syv eller flere ture uden kort, og intet i koden sikrer, at samtalen nogensinde går videre.
5. **Testene dækker det ikke.** Den falske klient (`fakeAiClient.ts`) svarer altid med samme spørgsmål, medmindre teksten indeholder et nøgleord ("blegning", "undersøgelse"). Der er ingen test, der kører en almindelig samtale igennem til kortene.

(Akut er ikke årsagen: `flowStepForApp()` ignorerer `emergency`, og med `emergencyReferralInChat = false` gemmes `emergency` altid som `false`.)

**Reglerne fra trin 9.** Princippet er uændret: AI'en sætter ingen felter på sagen, og patienten bekræfter selv. Ændringen er, at kortet ikke længere afhænger af ét flag i én tur.

| # | Regel | Hvor |
|---|---|---|
| 1 | `nextCaseFlowStep()` giver `services`, når der ingen bekræftede ydelser er, og mindst én af disse gælder: `readyForSummary`, samtalen er `closed`, **`caseDto.suggestedServices` er ikke tom**, eller **patienten har sendt mindst `SERVICE_CARD_AFTER_USER_MESSAGES` (6) beskeder** (talt i `chatState.messages` med `role === "user"`). Funktionen får `suggestedServices` med i sit `Pick`. Uden forslag viser kortet som i dag "Jeg er ikke sikker" og "Vælg selv" | `lib/cases/domain/case-flow.ts`, konstanten i `lib/cases/constants/case-flow.ts` |
| 2 | `ChatStateDto.readyForSummary` er **klæbende**: `true`, hvis en assistentbesked i samtalen har `ready_for_summary` (ikke kun den seneste). `useChat` i appen holder `ready` sand, når den først er sand. Ingen migration | `features/cases/chatController.ts`, `mobile/src/hooks/use-chat.ts` |
| 3 | **Forslag går ikke tabt i guarden.** Fejler begge forsøg kun på teksten (`reply` eller `preliminaryAssessment`), men det sidste forsøg var gyldigt efter skemaet, alle slugs findes i kataloget, og det havde `readyForSummary = true` med forslag, så returnerer guarden den faste tekst `SUGGESTION_FALLBACK_TEXT` (`lib/cases/constants/ai-texts.ts`: "Ud fra det, du har fortalt, kan behandlingerne nedenfor være relevante. Du vælger selv, og klinikken laver den endelige vurdering.") med forslagene, `readyForSummary = true`, `preliminaryAssessment = null`, `quickReplies = []` og `blocked = true` (sporbarhed). Den afviste tekst bruges aldrig. Gælder ikke ved akut, når `emergencyReferralInChat` er slået til | `features/cases/ai/guard.ts` |
| 4 | **Prompt `chat.v5.ts` (nu `chat.v7.ts`, se række 9), regler `rules-v5` (nu `rules-v6`):** højst tre opklarende spørgsmål, før AI'en foreslår (straks, hvis patienten er klar); hvert spørgsmål har 2-4 hurtigsvar, og et af dem må være "Ved ikke". I forslagsturen skriver AI'en kun én til to sætninger om, hvad behandlingerne går ud på, og nævner **hverken klinikker, bekræftelse eller næste skridt** (det gør TandMatch-kortet med faste tekster). Har AI'en først foreslået, gentager den forslagene og `readyForSummary = true` i de følgende ture, medmindre patienten beskriver et nyt problem. `chat.v4.ts` slettes i samme commit, og `AI_RULES.version` hæves til `rules-v5` (og `MDR_STRICT_RULES.version` tilsvarende) | `features/cases/ai/prompts/chat.v6.ts`, `features/cases/ai/rules.ts` |
| 5 | **Hurtigsvar** vises under AI'ens seneste besked, når den har nogen, også når behandlingskortet er åbent (guarden giver i forvejen `[]` i forslagsturen). Kortene under hurtigsvarene står uændret | `mobile/src/utils/case-cards.ts` (`visibleQuickReplies`) |
| 6 | **Falsk klient som en rigtig samtale:** uden nøgleord stiller to spørgsmål med hurtigsvar og foreslår `undersoegelse` med `readyForSummary = true` fra patientens tredje besked (tæller patientens beskeder i historikken). Nye markører: `test_suggest_not_ready` (forslag uden flag) og `test_blocked_suggestion` (gyldige forslag, men en pris i `reply` i begge forsøg). Eksisterende markører og tests består | `features/cases/ai/fakeAiClient.ts` |
| 7 | **Rejse-test mod den falske klient:** `features/cases/__tests__/api/case-flow-journey.test.ts` kører hele sagen gennem API'et som appen (bearer, `X-TandMatch-Client: mobile`) og beregner trinnet med `nextCaseFlowStep()` efter hvert kald: anonym session → tre almindelige beskeder → `services` med forslaget `undersoegelse` → én besked mere → stadig `services` → `PUT /services` → `timeframe` → `PATCH` → `postal_code` → `PATCH` → `summary` → `POST`/`PUT /summary` → `ready` → konto (`/convert`) → `canSend`. Desuden: seks beskeder uden forslag giver `services` uden forslag; `test_suggest_not_ready` giver `services`; `test_blocked_suggestion` giver `SUGGESTION_FALLBACK_TEXT` og `services`. Til sidst `GET /api/clinics?services=…&onlyOffering=true` med sagens behandlinger (10.7) | testen |
| 8 | **Prompt `chat.v6.ts`, regler `rules-v6`:** (a) nyt afsnit `scopeSection()`: tandkød (blødning, hævelse, tilbagetrækning), manglende tænder, børn m.m. er udtrykkeligt inden for området, blødning fra tandkød ved tandbørstning er ikke akut, og AI'en afviser kun pris/klinikvalg eller emner uden for tænder og mund. Årsagen til fejlen var, at modellen i `reply` kommenterede årsag og alvor ("kan være betændelse"), hvilket reply-filteret afviste to gange, så guarden gav den faste tekst `CHAT_BLOCKED_TEXT`; prompten forbyder nu årsager, diagnoseord og alvorsvurdering i `reply` (de hører kun hjemme i `preliminaryAssessment`) og retry-påmindelsen siger det samme. (b) nyt afsnit `serviceSelectionSection()`: foreslå de mest specifikke ydelser (barn: `boerneundersoegelse` m. `tilvaenning_tandlaege`; manglende tand: `implantat_samtale`/`bro`/`delprotese`; tandkød: `tandkoedsundersoegelse`), `undersoegelse` kun som udgangspunkt eller supplement, foreslå straks i stedet for at spørge om lov. (c) **højst 3 forslag**: prompten beder om det, og guarden afkorter til `MAX_CHAT_SUGGESTIONS` (3). Slugs valideres stadig mod kataloget; ingen priser, ingen klinikker. Filter, akut-detektion og `emergencyReferralInChat` er uændrede. Tests: "chat.v6" i `__tests__/ai/guardrails.test.ts` (inkl. opt-in live-tests med `AI_LIVE=1`) | `features/cases/ai/prompts/chat.v6.ts`, `features/cases/ai/guard.ts`, `features/cases/ai/rules.ts` |
| 9 | **Prompt `chat.v7.ts` (erstatter `chat.v6.ts`, som slettes), regler `rules-v6` uændret:** nyt afsnit BILLEDTUR og feltet `images` i chat-skemaet (7.9c, 2026-10-24). Billedturen er en tur uden patientbesked: AI'en kvitterer kort for de nye billeder, stiller evt. næste spørgsmål og vurderer kun billedets tekniske kvalitet (`ok`, `too_dark`, `blurry`, `wrong_angle`, `not_teeth`) og vinkel i `images`; ingen fortolkning, priser eller klinikker. Ved almindelige ture er `images` `[]`. `buildChatSystemPrompt()` er uændret ellers; guarden, filtrene og `emergencyReferralInChat` er de samme | `features/cases/ai/prompts/chat.v7.ts`, `features/cases/ai/aiChatService.ts`, `features/cases/ai/schemas.ts` |

Reglerne i 7.3 gælder uændret: ingen priser, ingen klinikanbefaling, foreløbig vurdering kun i `preliminaryAssessment` med forbehold, og patienten bekræfter selv. Ændring 3 og 4 rører AI-reglerne, så security-agenten kører efter dem (`docs/security.md`).

---

## 9. Billeder og storage

### 9.2 `case-images`: sti og adgang

Sti: `{case_id}/{image_id}.jpg`. Ingen `patient_id` i stien. Billeder i beskedtråden (`message_images`, leads 10.12) ligger i samme private bucket under præfikset `messages/{lead_id}/{image_id}.jpg`, så de får samme regler (ingen policies, service role kun til upload, sletning og signering efter en RLS-beskyttet læsning) og samme oprydning ved tilbagetrækning af samtykket. Sags-id'er er uuid'er, så præfikset kan ikke støde sammen med en sagsmappe.

- **Ingen policies for `authenticated` eller `anon`** på `storage.objects` for denne bucket: hverken SELECT, INSERT, UPDATE eller DELETE.
- Upload, sletning og rækkeinsert sker kun med service role efter serverens tjek (9.3).
- **Læsning:** serveren henter stien gennem en RLS-beskyttet læsning (patient: egne `case_images`; klinik: `clinic_lead_images()`, som kræver lead og aktivt samtykke) og signerer derefter med service role (TTL 5 min). Signerede URL'er logges ikke.

### 9.3 Upload-flow (`POST /api/cases/{id}/images`)

Bygget for forespørgsler; tilpasses til sager.
1. Session, rolle patient (anonym tilladt), ejer, sag `draft`, færre end 5 billeder, for anonyme under 20 MB samlet. Opdatér `last_active_at`. Filen læses først efter tjekkene (`imageFileReader`).
2. Aktivt `image_upload`-samtykke, ellers 403 `CONSENT_REQUIRED`.
3. Klienten har nedskaleret (max 2048 px, < 4 MB). Serveren tjekker størrelse og magic bytes (JPEG, PNG, HEIC).
4. `sharp` re-encoder til JPEG og fjerner EXIF.
5. Service role skriver filen og `case_images`-rækken med `consent_id`.
6. Trigger nulstiller `summary_approved_at`.
7. Returnér `ImageDto` med signeret URL og `createdAt`. `quality` er `null` ved upload; den sættes af billedturen (7.9c) og vises derefter i `GET /api/cases/{id}`.

### 9.4 Samtykke og sletning

- Samtykke gemmes server-side med `granted_at` og kendt `text_version` **før** upload; hvert billede peger på sit samtykke. Billedsamtykket gives særskilt lige før første upload, aldrig på `/start` og aldrig sammen med AI-samtykke eller vilkår.
- Tilbagetrækning af `image_upload` sletter patientens billeder (filer og rækker), også på sendte sager og de billeder, patienten har sendt i beskedtråde (`message_images` med patientens `consent_id`; migration `20261103000100`); klinikkerne mister dermed adgangen.
- Kontosletning sletter billedmapperne for alle patientens sager og beskedtråde (`messages/{lead_id}/`), alle rækker (cascade, herunder leads, beskeder, bookinger og anmeldelser) og auth-brugeren.
- Anonyme billeder slettes 48 timer efter seneste aktivitet.
- Opbevaringsperiode for kontodata: [UDSKUDT].

## 10. API-kontrakter

### 10.5 Sager (patient)

Bygget i trin 3 (3.1 og 3.3); leads-routerne i 4.1. Filer: `features/<domæne>/{cases,caseImages,summary,leads}Controller.ts`, `models/{cases,caseImages,caseServices,summary,leads}Repository.ts`, `features/cases/caseImageUrlService.ts` (signerede URL'er), `lib/schemas/{cases,leads}.ts`, `lib/leads/domain/leads.ts` (`isActiveLead`, `canSendMoreLeads`, `canSendCase`; en sendt sag kan sendes til flere klinikker, kun en lukket kan ikke, som i `send_leads()`), `lib/leads/constants/leads.ts` (`LEAD_STATUSES`, `LEAD_ACTIVE_STATUSES`). Anonyme får 403 `ACCOUNT_REQUIRED` på afsendelse og tilbagetrækning; `GET /api/cases/{id}/leads` giver en anonym ejer en tom liste. `POST /api/cases/{id}/leads` har IP-grænsen `enforceIpRateLimit("leads-send", req, 30)` (`LEADS_SEND_IP_LIMIT_PER_HOUR`) pr. time; derudover gælder døgnloftet pr. patient (7.6) i databasen. `POST /api/auth/convert` har samme IP-grænse som signup. `CaseDto.canSend` tager højde for både de 3 aktive og de 10 i alt (`canSendCase(record, serviceCount, activeCount, totalCount)`), og UI bruger kun serverens `canSend`; `CaseDto.leadCount` er aktive leads og `CaseDto.totalLeadCount` alle leads, og `CaseListItemDto.leads[]` har `removed`; antallet af ledige pladser i UI er `remainingLeadSlots(active, total)` = min(3 − aktive, 10 − i alt) fra `lib/leads/domain/leads.ts`. Tællingen ligger i `LeadsRepository.countForCase()` (aktive og i alt).

Fejlkoder ud over de generelle: `POST /summary` giver 409 `NO_CONVERSATION`, hvis der ikke er en samtale at opsummere, og 429 `SUMMARY_LIMIT` ved loftet (7.6). Tekstgrænsen på 1500 tegn for opsummeringen står ét sted (`SUMMARY_MAX_CHARS` i `lib/common/constants/limits.ts`). **`summary_ai_assisted`:** `false`, hvis under 50 % (`AI_DRAFT_MIN_SHARED_WORDS` i `lib/common/constants/limits.ts`) af den godkendte teksts ord på mindst 3 tegn findes i AI-udkastet (`buildsOnAiDraft()` i `lib/cases/domain/summary.ts`); databasen tvinger `false`, når der ikke er et AI-udkast (`approve_summary()`, 5.3). `aiSummary` parses med zod (`parseAiSummary()` i `lib/cases/schemas/aiSummary.ts`; ugyldigt → `null`). `CaseDto.images[]` har `description` (AI'ens billedbeskrivelse, vist med mærkat i opsummeringstrinnet). Kladdetjek sker ét sted, `CasesRepository.requireOwnDraft()`; det aktive samtykke med gyldig tekstversion hentes med `ConsentsRepository.requireCurrentActive()` (chat, opsummering, upload og afsendelse, 4.3).

```ts
// lib/cases/types/cases.ts
export type CaseStatus = "draft" | "submitted" | "closed";
export type CaseTimeframe = "asap" | "within_2_weeks" | "within_3_months" | "flexible";

export type CaseDto = {
  id: string;
  status: CaseStatus;
  isEmergency: boolean;
  postalCode: string | null;
  preferredTimeframe: CaseTimeframe | null;
  services: (ServiceDto & { suggestedByAi: boolean })[];   // bekræftede
  suggestedServices: ServiceDto[];                         // seneste AI-forslag, ikke bekræftet
  images: ImageDto[];
  hasConversation: boolean;
  aiSummary: AiSummary | null;
  summaryText: string | null;
  summaryApprovedAt: string | null;
  submittedAt: string | null;
  leadCount: number;
  canSend: boolean;                                        // lib/leads/domain/leads.ts
};

export type CaseListItemDto = {
  id: string; status: CaseStatus; isEmergency: boolean; serviceNames: string[];
  submittedAt: string | null;
  leads: { id: string; clinicName: string; status: LeadStatus }[];
  nextBooking: { startsAt: string; clinicName: string } | null;
};
```

"(+anonym)" = virker også for en anonym patient, der ejer sagen.

| Metode og route | Rolle | Input | Output |
|---|---|---|---|
| GET `/api/cases` | kun patient med konto (anonyme: 403) | | `{ cases: CaseListItemDto[] }`. `nextBooking` er sagens næste fremtidige `booked` tid (fra 6.1); `clinicName` kommer fra `patient_lead_clinics()` |
| POST `/api/cases` | kun patient med konto (anonyme: 403) | `{}` | 201 `CaseDto` |
| GET `/api/cases/{id}` | patient (+anonym), ejer | | `CaseDto` |
| PATCH `/api/cases/{id}` | patient (+anonym), `draft` | `{ postalCode?, preferredTimeframe? }` | `CaseDto` |
| DELETE `/api/cases/{id}` | patient (+anonym), `draft` | | 204. Controlleren tjekker ejer og kladde med brugerens JWT og sletter derefter sagen og billedfilerne med service role (der er ingen DELETE-policy på `cases`, 5.4) |
| PUT `/api/cases/{id}/services` | patient (+anonym), `draft` | `{ services: { serviceId, suggestedByAi }[] }` (1-5) | `CaseDto` |
| POST `/api/cases/{id}/images` | patient (+anonym), `draft`, aktivt `image_upload` | multipart `file` | 201 `ImageDto`; 411 `LENGTH_REQUIRED` uden `content-length` |
| DELETE `/api/cases/{id}/images/{imageId}` | patient (+anonym), `draft` | | 204 |
| POST `/api/cases/{id}/summary` | patient (+anonym), `draft`, aktivt `ai_processing` | `{}` | `SummaryResponse`. Udkastet gemmes, også når billeder bør tages om; `retakeImages` fortæller patienten det, men blokerer ikke godkendelsen |
| PUT `/api/cases/{id}/summary` | patient (+anonym), `draft` | `{ summaryText }` (max 1500) | `{ summaryText, summaryApprovedAt }` |
| POST `/api/cases/{id}/leads` | patient med konto, aktivt `health_data_sharing` | `{ clinicIds: string[] }` (1-3; samlet ≤ 3 med de **aktive** leads og ≤ 10 med alle leads på sagen) | 201 `{ leads: PatientLeadDto[] }`; 403 `ACCOUNT_REQUIRED`; 403 `CONSENT_REQUIRED`, hvis der ikke er et **gældende** `health_data_sharing` (aktivt og med gældende tekstversion, `ConsentsRepository.requireCurrentActive()`; tjekket i `LeadsController` før RPC'en (bygget i 7.2); databasen tjekker som sidste værn den ikke-pensionerede version via `has_active_consent()` fra migration `20261028000500`, 4.3); 409 `LEAD_LIMIT`, `LEAD_TOTAL_LIMIT`, `CLINIC_ALREADY_CONTACTED`, `CLINIC_NOT_AVAILABLE`, `CASE_NOT_READY`; 429 `LEAD_DAILY_LIMIT`, `RATE_LIMITED` |
| POST `/api/leads/{id}/withdraw` | patient, ejer af sagen, lead `sent` | `{}` | `PatientLeadDto` (status `withdrawn`); 409 `LEAD_NOT_PENDING`, hvis leadet er besvaret |
| GET `/api/cases/{id}/leads` | patient (+anonym), ejer | | `{ leads: PatientLeadDto[] }` |
| POST `/api/cases/{id}/close` | patient (+anonym for kladde), ejer; sag `draft` eller `submitted` | `{}` | `CaseDto` med `status: "closed"`. Kalder `close_case()`: ubesvarede og accepterede leads uden booking bliver `withdrawn`, reservationer frigives, bookede tider består. Idempotent |

```ts
export type SummaryResponse = {
  summary: AiSummary | null;
  retakeImages: { imageId: string; reason: "too_dark" | "blurry" | "wrong_angle" | "not_teeth" }[];
  outOfScopeNotice: boolean;
  fallback: "none" | "write_yourself";
  generationsLeft: number;
};
```

### 10.6 AI-chat (patient)

Bygget i trin 3 (3.3): `features/cases/chatController.ts`, `features/cases/chatRepository.ts`, `lib/cases/schemas/chat.ts`, `features/cases/ai/{aiChatService,aiSummaryService,modelClient,fakeAiClient}.ts` og `features/cases/aiImageService.ts` (billeder til AI'en). Svaret på patientens 30. besked gemmes, selvom samtalen dermed er lukket (5.3). Turen reserveres før modelkaldet med `reserve_chat_turn()`; fejler noget efter reservationen, gemmes `CHAT_UNAVAILABLE_TEXT`, og routen svarer 503 `AI_UNAVAILABLE`, så frontend ved, at turen er gemt, og henter samtalen igen i stedet for at sende beskeden igen (chatpanelet gør det fra commit `4649015d`). IP-grænse 120 pr. time. En anonym session, der har været inaktiv i over 48 timer, afvises med 401 og forlænges ikke.

```ts
// lib/cases/types/ai.ts (fortsat)
export type AiChatMessageDto = {
  id: string; role: "user" | "assistant"; content: string;
  preliminaryAssessment: string | null;
  suggestedServices: ServiceDto[];
  emergency: boolean;
  outOfScopeTopics: OutOfScopeTopic[];
  blocked: boolean; createdAt: string;
};
export type ChatStateDto = { conversationId: string | null; status: "active" | "closed"; messages: AiChatMessageDto[]; messagesLeft: number; readyForSummary: boolean };
export type ChatTurnResponse = { userMessage: AiChatMessageDto; assistantMessage: AiChatMessageDto; outOfScopeNotice: boolean; emergency: boolean; readyForSummary: boolean; messagesLeft: number;
  quickReplies: string[];   // (bygget, 8.6g-h) 0-4, filtrerede (7.4); gemmes ikke: kun i ChatTurnResponse.assistantMessage, altid [] i GET /chat
};
```

```ts
// POST /api/cases/{id}/chat/image-turn (7.9c). Ingen userMessage: turen er ikke en patientbesked.
export type ImageTurnResponse = {
  assistantMessage: AiChatMessageDto;   // med quickReplies som i ChatTurnResponse
  assessedImages: { imageId: string; view: ImageView | null; quality: ImageQuality | null }[]; // kun de nye billeder
  outOfScopeNotice: boolean;
  emergency: boolean;
  readyForSummary: boolean;
  messagesLeft: number;                 // uændret af turen
};
// ImageDto (lib/common/types/common.ts) har fået createdAt?: string (ISO 8601): altid sat på patientens egne billeder
// (CaseDto.images, POST /images), udeladt på klinikkens billeder (leads).
```

Appens samtaleflow (7.9) bruger routes og DTO'er uændret; kun `quickReplies` er nyt (P2). Fra 8.6c kan `readyForSummary` kun være `true`, når samme svar har forslag (7.4). Fra trin 9.2 er `ChatStateDto.readyForSummary` `true`, hvis **en** assistentbesked i samtalen har haft flaget (klæbende, 7.9a regel 2); `ChatTurnResponse.readyForSummary` gælder stadig kun turen.

| Metode og route | Rolle | Input | Output |
|---|---|---|---|
| GET `/api/cases/{id}/chat` | patient (+anonym), ejer | | `ChatStateDto` |
| POST `/api/cases/{id}/chat` | patient (+anonym), ejer, `draft`, aktivt `ai_processing` | `{ message }` (1-1000) | 201 `ChatTurnResponse`; 403 `CONSENT_REQUIRED`; 409; 429 `CHAT_LIMIT`/`RATE_LIMITED`/`ANON_CAP_REACHED`; 503 |
| POST `/api/cases/{id}/chat/image-turn` | patient (+anonym), ejer, `draft`, aktivt `ai_processing` **og** `image_upload` | `{}` (tom body) | 201 `ImageTurnResponse` (7.9c); 403 `CONSENT_REQUIRED`; 409 `NO_NEW_IMAGES` (ingen nye billeder siden sidste billedtur); 429 `CHAT_LIMIT` (samtalen er lukket) / `RATE_LIMITED` / `ANON_USER_LIMIT` / `ANON_CAP_REACHED`; 503 `AI_UNAVAILABLE` (billederne kan sendes igen) |
