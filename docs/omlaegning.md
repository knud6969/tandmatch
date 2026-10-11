# Omlægning til klinik- og lead-modellen

Status 2026-10-11. Overblik over den nuværende kode og database, og hvad der kan genbruges i den nye model (CLAUDE.md). Dokumentet er et arbejdsredskab til omlægningen og kan slettes, når den er færdig. Selve den nye model beskrives i `docs/architecture.md`.

Markering pr. del:
- **Genbrug:** bruges som den er, evt. med omdøbning.
- **Tilpas:** samme idé, men logik eller felter ændres.
- **Erstat:** skrives på ny; dele af koden kan kopieres.
- **Slet:** udgår i den nye model.

## 1. Sådan hænger det sammen i dag

```
Patient (anonym → konto)                                        Tandlæge (konto)
  /start: kategori + AI-samtykke → anonym session + kladde
  /start/[id]: wizard
    faste spørgsmål → AI-chat → billeder → AI-opsummering → godkend
    → opret konto → samtykke til deling → send
                                   │ send_request(): matcher op til 10 tandlæger ≤ 25 km
                                   v
                          request_recipients ─────────────→  /tandlaege: indbakke
                                                               svar: vurdering, pris, tid, tilbud
  /patient/forespoergsel/[id]: sammenlign svar  ←── responses
    vælg tandlæge (decide_response) → beskedtråd (messages)
  besøg (visits, kun seed) → anmeldelse → prisnøjagtighed

Standard-spor: /tandlaeger liste + profil (public_dentists, clinic_prices, reviews)
```

Kernen er **forespørgslen** (`requests`), som systemet sender ud til mange **tandlæger**. I den nye model er kernen **sagen**, som patienten selv sender til op til 3 **klinikker** som leads, og som ender i en **booking**.

## 2. Backend

### middleware/ (alt genbruges)

| Fil | Markering | Note |
|---|---|---|
| `http.ts` (ApiError, withApi, readJson, readQuery, parseId, imageFileReader …) | Genbrug | |
| `session.ts` (getSession, requireRole, requireParticipant …) | Tilpas | Rollen `dentist` bliver `clinic`. `requireParticipant` gælder lead i stedet for svar |
| `termsGate.ts`, `termsCookie.ts`, `rateLimit.ts`, `cron.ts` | Genbrug | |
| `areaGuard.ts` | Tilpas | Området `/tandlaege` bliver `/klinik` |

### controllers/

| Fil | Markering | Bliver til |
|---|---|---|
| `authController` (login, signup, logout, convert) | Tilpas | Signup for klinik i stedet for tandlæge (CVR, klinikoplysninger) |
| `sessionController` (anonym session) | Tilpas | Opretter en tom sag i stedet for en kladde med kategori |
| `meController`, `termsController`, `cronController` | Genbrug | |
| `consentsController` (giv, list, træk tilbage) | Genbrug | |
| `patientsController` (profil, slet konto) | Tilpas | Telefonnummer til booking |
| `exportController` | Tilpas | Eksporterer sager, leads, bookinger og anmeldelser |
| `imagesController` (upload, slet) | Genbrug | Billeder hænger på sagen |
| `chatController` | Tilpas | Hænger på sagen. Gemmer AI'ens forslag til ydelser |
| `summaryController` (udkast, godkend) | Tilpas | Opsummeringen skrives til klinikken (leadet) |
| `requestsController` (kladde, patch, slet, send) | Erstat | `casesController`. `send` erstattes af afsendelse af leads |
| `responsesController` (svar, træk tilbage, vælg) | Erstat | `leadsController`: klinikken accepterer eller afviser |
| `inboxController` (tandlægens indbakke og detalje) | Erstat | Klinikkens lead-indbakke. Kortet til ét lead kan bygge på detaljevisningen |
| `dentistsController` (egen profil, klinik) | Erstat | `clinicsController`: profil, prisliste, åbningstider, tandlæger, portefølje |
| `standardTrackController` (liste, profil, anmeldelser) | Erstat | Klinikoversigt og sammenligning. Afstand og sortering kan genbruges |
| `messagesController` | Tilpas | Tråd pr. lead i stedet for pr. svar |
| `reviewsController` | Tilpas | Anmeldelse af klinikken, kræver gennemført booking |
| *(ny)* | Ny | `servicesController` (katalog), `bookingsController` (ledige tider, book, aflys), `portfolioController` |

### services/

| Fil | Markering | Note |
|---|---|---|
| `imageProcessing.ts` (sharp, EXIF) | Genbrug | Bruges også til porteføljebilleder |
| `accountDeletion.ts` | Genbrug | |
| `ai/openai.ts`, `ai/errors.ts`, `ai/pii.ts` | Genbrug | |
| `ai/chat.ts`, `ai/summary.ts` | Tilpas | Nyt output: forslag til ydelser (id'er fra kataloget), foreløbig vurdering, akut-markering |
| `ai/schemas.ts`, `ai/prompts/*` | Erstat | Ny rolle for AI'en (CLAUDE.md). Nye prompt-versioner |
| `ai/guard.ts`, `ai/forbiddenTerms.ts` | Tilpas | Kun priser og klinikanbefalinger blokeres nu. Diagnoseordene gemmes til MDR-tilpasningen senere |
| `ai/formLabels.ts`, `ai/promptFormat.ts` | Tilpas | De faste spørgsmål udgår |
| *(ny)* | Ny | Rangering af klinikker (faste kriterier), beregning af ledige tider |

### models/

| Fil | Markering | Note |
|---|---|---|
| `db/*`, `authModel`, `termsModel`, `consentsModel`, `rateLimitModel`, `cleanupModel` | Genbrug | |
| `profilesModel`, `patientsModel` | Tilpas | Ny rolle, telefonnummer |
| `imagesModel` (rækker og storage) | Tilpas | Sag i stedet for forespørgsel |
| `chatModel` | Tilpas | Sag i stedet for forespørgsel |
| `requestsModel` | Erstat | `casesModel` |
| `responsesModel`, `inboxModel` | Erstat | `leadsModel` |
| `dentistsModel`, `clinicsModel` | Erstat | `clinicsModel` (konto), `clinicDentistsModel` (kun visning) |
| `standardModel` | Erstat | Klinikoversigt, prislister, statistik |
| `reviewsModel`, `messagesModel` | Tilpas | |
| *(ny)* | Ny | `servicesModel`, `bookingsModel`, `availabilityModel`, `portfolioModel` |

## 3. lib/

| Del | Markering | Note |
|---|---|---|
| `constants/categories.ts`, `constants/standard.ts` (faste lister over kategorier og ydelser) | Slet | Erstattes af ydelseskataloget i databasen. Valgmulighederne for prisnøjagtighed flyttes til `constants/reviews.ts` |
| `constants/questions.ts` (faste spørgsmål) | Slet | AI'en spørger ind i stedet (CLAUDE.md) |
| `constants/inbox.ts` | Erstat | Statusser for leads |
| `constants/consents.ts`, `legal.ts`, `limits.ts`, `sessions.ts`, `ai-texts.ts` | Genbrug / tilpas | Nye lofter for leads og bookinger. AI-tekster opdateres |
| `navigation/` | Tilpas | Nye områder og sider |
| `domain/request-open.ts` | Slet | Ny domæneregel for leads og bookinger |
| `types/`, `schemas/` | Tilpas / erstat | Følger controllers ovenfor. `auth`, `consents`, `patients`, `chat` og `messages` kan stort set genbruges |

## 4. Frontend (views/ og app/)

| Del | Markering | Note |
|---|---|---|
| `components/ui/` (14 komponenter), `views/utils/` | Genbrug | Grundlaget for det nye design. Farverne flyttes til Tailwind-temaet (hvid og blå) |
| `components/layout/`, `components/session/` | Tilpas | Ny navigation og nye områder |
| `components/auth/` | Tilpas | Tandlæge-signup bliver klinik-signup |
| `components/chat/chat-panel.tsx` | Tilpas | Den nye chatbot. Skal kunne vise forslag til ydelser og akut-henvisning |
| `components/wizard/` | Erstat delvis | `images-step`, `prepare-image`, `consent-gate`, `chat-step`, `summary-step` og `delete-conversation` genbruges. `category-step`, `questions-step`, `send-step` og selve `request-wizard` udgår |
| `components/standard/` | Tilpas | Bliver klinikoversigten: `dentist-card` → klinikkort, `dentist-search` → filtre. `trustpilot-block`, `star-rating` og `public-review-list` genbruges |
| `components/dentist/` | Erstat delvis | `clinic-form` genbruges i opsætningen. `inbox-list` og `request-detail` bliver lead-indbakke og lead-kort. `response-form`, `withdraw-response` og `dentist-profile` udgår |
| `components/patient/` | Tilpas | `consents-list`, `data-export-button` og `own-reviews` genbruges. `decision-controls` og `patient-responses` udgår; der kommer status for leads og bookinger. `eligible-visits` og `review-form` bygger på bookinger |
| `components/responses/message-thread.tsx` | Genbrug | Tråd pr. lead |
| *(ny)* | Ny | Forside og informationssider, kort (Leaflet), sammenligning, kalender og booking, opsætning af prisliste og åbningstider, portefølje |
| Sider i `app/` og `views/pages/` | Tilpas | `/tandlaege` bliver `/klinik`, `/tandlaeger` bliver `/klinikker`, `/start` bliver chatten, `/patient/forespoergsel` bliver sager |

## 5. Databasen

Alle 27 migrationer er kørt i Supabase. Der er ingen rigtige data, så den nye model skrives som **et nyt, samlet sæt migrationer**, og databasen nulstilles.

| Nuværende | Markering | Bliver til |
|---|---|---|
| `profiles` | Tilpas | Rollen `dentist` bliver `clinic` |
| `patients` | Tilpas | Telefonnummer (synligt for klinikken efter booking) |
| `terms_acceptances`, `consents`, `consent_text_versions`, `postal_codes` | Genbrug | |
| `ai_conversations`, `ai_messages` | Tilpas | Hænger på `cases`. Gemmer AI'ens forslag til ydelser |
| `ai_limits`, `ai_usage_daily`, `ai_patient_usage_daily`, `rate_limits` | Genbrug | Rettelse: `try_consume_anonymous_ai_call()` skal have bruger-id'et som parameter (fejlen i 5.3) |
| `requests` | Erstat | `cases` (sag) og `case_services` (bekræftede ydelser) |
| `request_images` | Tilpas | `case_images` |
| `request_recipients`, `responses` | Erstat | `leads` (maks. 3 pr. sag, status sendt/accepteret/afvist/booket) |
| `clinics` | Tilpas | Kontoen. Status: importeret / oprettet / verificeret. CVR, beskrivelse, Trustpilot |
| `dentists` | Erstat | `clinic_dentists` (kun visning, intet login) |
| `clinic_prices` | Tilpas | Prisliste pr. ydelse i kataloget med varighed |
| `visits` | Erstat | `bookings` (gennemført = verificeret besøg) |
| `reviews`, `review_replies` | Tilpas | Peger på booking og klinik |
| `messages` | Tilpas | Peger på lead |
| *(ny)* | Ny | `services` (katalog), `clinic_opening_hours`, `clinic_time_blocks`, `portfolio_items` |
| Enums `cosmetic_category`, `standard_service`, `recipient_status`, `response_status`, `patient_decision` | Slet | Kataloget og lead-status erstatter dem |

**Funktioner:**
- *Genbruges:* `approve_summary`, `store_ai_summary`, `append_assistant_message`, `consume_summary_generation`, `withdraw_consent`, `confirm_consent_cleanup`, `touch_last_active` og `consume_rate_limit`. De peger fremover på sager i stedet for forespørgsler.
- *Erstattes:* `send_request` bliver afsendelse af leads. `decide_response` bliver accept/afvis af leads. `dentist_*` bliver `clinic_*`. `public_*` bliver klinikoversigten.
- *Slettes:* de fire ubrugte funktioner i architecture 12.5.

**Storage:** bucket `request-images` genbruges som billeder til sagen. Der kommer en ny offentlig bucket til portefølje og profilbilleder.

## 6. Øvrigt

| Del | Markering | Note |
|---|---|---|
| `proxy.ts` | Tilpas | Nye områder |
| `scripts/seed-demo.ts`, `unseed-demo.ts` | Erstat | Katalog, klinikker (oprettede og importerede), tandlæger, prislister, åbningstider, sager, leads, bookinger og anmeldelser |
| `tests/ai/guardrails.test.ts` | Tilpas | Nye regler: ingen priser, ingen klinikanbefaling, akut-henvisning |
| `tests/rls/*.sql` | Erstat | Nye tabeller og regler (isolation af leads, kontaktoplysninger efter booking, maks. 3 leads, dobbeltbooking) |
| `eslint.config.mjs` (lagregler), `docs/architecture.md` 2.1-2.2, 2.6 | Genbrug | Strukturen er den samme |

## 7. Grov vurdering

- **Infrastrukturen kan genbruges næsten fuldt ud:** MVC-lagene, middleware, auth og anonym session, vilkår, samtykker, billedhåndtering, AI-klienten, UI-komponenterne og beskedtråden.
- **Domænelogikken skal skrives om:** forespørgsel → sag og lead, tandlæge → klinik, svar → accept/afvis. Det gælder samt standard-spor → klinikoversigt, og prisliste, kalender og booking er helt nye.
- **Rækkefølge:**
  1. ny `docs/architecture.md`
  2. nye migrationer
  3. models og controllers
  4. AI
  5. views.

  Gamle filer slettes i samme trin, som deres afløser bygges, så koden aldrig har to versioner af det samme.
