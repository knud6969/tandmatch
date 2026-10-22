# Opgave: omorganisér koden fra lag til funktioner (features)

**Mål:** Gør det nemmere at finde rundt i koden, arbejde parallelt (flere agenter/personer uden flettekonflikter) og bygge videre. Alt om én funktion (fx booking) skal ligge samlet, i stedet for at være spredt over `controllers/`, `models/`, `services/`, `lib/`, `views/` og `tests/`. MVC bevares som opdeling *inde i* hver funktion.

## Rammer (vigtigt)

- **Kun flytning.** Ingen ændringer i logik, ingen omdøbning af klasser eller eksporter, ingen ændring af URL'er eller API-kontrakter, ingen ændring af `supabase/migrations/`. Klasser omskrives ikke til funktioner i denne opgave.
- **Kør først efter afleveringen** og efter at `feat/mobilapp-trin-8` er flettet ind i `main`. Arbejd på en ny branch `refactor/features`.
- **Spar tokens:** Flyt filer med et script (`git mv` + automatisk omskrivning af imports), ikke ved at læse og skrive filer om. Brug `grep`, `tsc`-fejl og testresultater til at finde det, der mangler. Læs ikke filer, der ikke skal ændres.
- Én commit pr. trin. Stop og rapportér, hvis noget ikke kan flyttes mekanisk.

## Trin 0: Baseline

Kør og notér resultatet, før noget flyttes: `npx tsc --noEmit`, `npm run lint`, `npm run test:unit`, `npm run test:api`, `npm run test:rls`, `npm run test:e2e`, `cd mobile && npx tsc --noEmit && npm test`, samt `npm run build` (gem listen over ruter). Alt skal være grønt, før du går videre.

## Trin 1: Fjern de pausede patientsider på weben (kræver brugerens godkendelse)

Patientsiderne på weben er sat på pause (architecture 13.6, 12.3 punkt 38), og appen i `mobile/` har overtaget dem. Find med `grep`, hvilke sider og komponenter der kun bruges af de pausede patientruter (`app/start`, `app/patient`, sagsflowet, chat, akut, beskeder m.fl.), og vis en kort liste til godkendelse. Slet derefter filerne og de e2e-tests, der kun tester dem. Behold alt, der stadig bruges af klinikportalen, den offentlige klinikoversigt og informationssiderne. `lib/` og API-ruterne røres ikke, fordi appen bruger dem.

## Trin 2: Flyttetabel (forslag, bekræft med import-grafen)

Lav en fil `scripts/refactor/moves.json` med gammel sti → ny sti for hver fil og vis tabellen kort til godkendelse, før du kører flytningen. Udgangspunktet er nedenfor. Rette til, hvis import-grafen viser, at en fil hører andre steder hen.

Målstruktur på serversiden og weben:

```
features/<domæne>/
  <x>Controller.ts, <x>Repository.ts, <x>Service.ts   (uændrede filnavne)
  components/        (web-UI for domænet)
  pages/             (sider, som app/ videresender til)
  __tests__/         (unit- og API-tests for domænet)
  index.ts           (den offentlige grænseflade: det andre domæner må importere)
platform/            (tværgående: middleware, databaseklienter, basisklasser)
components/ui/       (delte UI-komponenter, tidligere views/components/ui, layout)
lib/<domæne>/<art>/<navn>.ts   (delt med appen; art = types | schemas | constants | domain)
lib/common/...       (fælles typer, fejl, tid, position, navigation)
```

| Domæne | Controllere | Repositories / storage | Services | `lib/` (art/navn) |
|---|---|---|---|---|
| **identitet** | auth, session, me, terms, consents, patients, export | auth, profiles, patients, terms, consents | accountDeletion | auth, session, terms, patients, consents, roles, sessions, legal |
| **sager** | cases, caseImages, chat, summary | cases, caseImages, caseServices, chat, summary, caseImageStorage | `services/ai/*`, aiImage, caseImageUrl | ai, ai-schemas, ai-texts, aiSummary, cases, chat, case-flow, start |
| **klinikker** | clinics, clinicDentists, portfolio, clinicDirectory, services | clinics, availability, clinicDentists, portfolio, clinicDirectory, services, publicMediaStorage | availability, ranking | clinics, services, dentists |
| **henvendelser** | leads, messages | leads, messages | – | leads, messages, emergency |
| **booking** | bookings, reviews | bookings, reviews | – | bookings, reviews |
| **site** | – | – | – | – (informationssider: om-os, kontakt, privatliv, saadan-virker-det, saadan-tjener-vi-penge, for-klinikker) |

Tværgående → `platform/`: `middleware/*`, `models/base/*`, `models/db/*`, `rateLimitRepository`, `cleanupRepository`, `cronController`, `imageProcessingService`. Tværgående → `lib/common/`: `types/common`, `domain/errors`, `domain/time`, `domain/position`, `constants/error-texts`, `constants/limits`, `navigation/*`.

`views/utils/*` fordeles på domænet, der bruger dem (fx `booking-status`, `eligible-visits` → booking; `clinic-*` → klinikker; `case-*`, `prepare-image`, `upload-image` → sager; `api-client`, `api-errors`, `use-load`, `use-action`, `use-save-state`, `format`, `field-errors` → `platform/ui-utils/`). `app/` beholder alle sine rutefiler og stier (URL'erne må ikke ændre sig), men de peger på de nye placeringer.

## Trin 3: Flyt med script

1. Skriv `scripts/refactor/apply-moves.mjs`, der for hver række i `moves.json` kører `git mv` og derefter omskriver alle importspecifikatorer, der peger på den gamle sti (`@/…`, relative stier, `vi.mock(...)`, dynamiske imports, `eslint.config.mjs`, `vitest.config.*`, `tsconfig.json`, `mobile/metro.config.js`, `mobile/tsconfig.json`, `mobile/src/**`, `scripts/**`).
2. Appens `@/lib/...`-imports og Metro-/tsconfig-stierne til `lib/` skal opdateres sammen med flytningen, fordi appen deler `lib/` med serveren.
3. Kør scriptet ét domæne ad gangen (`identitet` først, fordi den er mindst), kør `npx tsc --noEmit` og `npm run lint`, ret rester, og commit: `refactor(<domæne>): flyt til features/<domæne>`.
4. Flyt til sidst unit- og API-testene til `features/<domæne>/__tests__/` og ret globbene i Vitest/test-scripts. `tests/rls/` og `tests/e2e/` bliver, hvor de er.

## Trin 4: Grænser i lint

Erstat lagreglerne i `eslint.config.mjs` (se `no-restricted-imports`) med grænser mellem domæner:
- `features/<a>` må importere `platform/`, `components/ui/`, `lib/` og andre domæners **`index.ts`**, aldrig deres interne filer.
- `lib/` må kun importere `lib/` og `zod`.
- `mobile/` må kun importere `lib/` fra roden.
- Lagene inde i et domæne (route → controller → repository) gælder stadig: `components/` importerer ikke repositories.

Hvis reglerne ikke kan udtrykkes med `no-restricted-imports`, så brug `eslint-plugin-boundaries`. `npm run lint` skal fejle ved et brud.

## Trin 5: Dokumenter og agenter

- Del `docs/architecture.md` (ca. 2.500 linjer) i en kort oversigt (højst ca. 300 linjer: lag, regler, domæner, hvor ting ligger) og en `features/<domæne>/README.md` pr. domæne med de relevante afsnit. Behold nummereringen i overskrifterne, så henvisninger i koden stadig kan findes.
- Opdatér `CLAUDE.md` og `.claude/agents/*.md` med den nye struktur, grænserne og reglen om, at ændringer i et domæne holdes inden for domænets mappe.
- Slet `docs/omlaegning.md`, og forkort `docs/arbejdsplan.md` til status og det, der er tilbage.
- Opdatér `README.md` med et mappeoverblik.

## Trin 6: Verifikation

Alle suiter fra trin 0 skal være grønne. `npm run build` skal give nøjagtig samme rutelister som før. `git diff --stat -M` skal vise næsten kun omdøbninger. Rapportér kort: hvor mange filer er flyttet, hvad blev slettet i trin 1, og hvad (hvis noget) blev ikke flyttet og hvorfor.

## Ikke med i denne opgave (kan tages bagefter, hver for sig)

- Klasser → funktioner pr. domæne.
- Egentlig monorepo med `apps/web`, `apps/mobile` og `packages/shared`.
- Nye funktioner.
