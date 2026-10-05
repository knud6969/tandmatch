# TandMatch

Webplatform (mobil + pc) hvor patienter beskriver et tandproblem, og tandlæger svarer med personlig vurdering, prisinterval, første ledige tid og tilbud. Gruppeprojekt på INNT (CBS).

## To spor
1. **Kosmetisk/elektiv** (diastema, facing, blegning, retainer m.m.): patienten sender en forespørgsel, matchende tandlæger svarer individuelt, tandlægerne kan ikke se hinandenstilbud.
2. **Standard/akut**: patienten ser en liste over tandlæger sorteret efter afstand, næste ledige tid, prisinterval for standardydelser og anmeldelser (Trustpilot-score med link til klinikkens Trustpilot-side, plus egne verificerede anmeldelser fra platformen, se Anmeldelser). Trustpilot scrapes ikke. Ingen individuelle svar.

Patienten vælger selv spor. AI'en vælger det ikke.

## Stack
Next.js (App Router, TypeScript), Tailwind, Supabase (Postgres, Auth, Storage, Row Level Security), OpenAI API kaldt fra server-routes.

## Faste regler
- Mobile-first. Tjek altid layout ved 390 px og 1280 px bredde.
- Al UI-tekst på dansk.
- API-nøgler kun i `.env.local` og kun brugt server-side. Aldrig i frontend-kode, aldrig i git. Commit kun `.env.example`.
- **AI-guardrail:** AI'en beskriver og strukturerer. Den må ALDRIG diagnosticere, vurdere alvorlighed, foreslå behandling eller anslå pris ud fra billeder/tekst. Hvis brugeren spørger om det, svarer den at det er tandlægens opgave. Dette er for at undgå at produktet bliver et medicinsk device (EU MDR).
- Tandlæger kan aldrig se hinandens svar. Håndhæves med Row Level Security i databasen, ikke kun i UI.
- Billeder må kun uploades efter eksplicit samtykke fra patienten (gemmes med tidspunkt). Fotos af munden er helbredsdata (GDPR art. 9). Der skal kræves oprettelse af bruger / login før at billeder samt beskrivelse kan postes på platformen, men der kan godt chattes uden login indtil da, hvilket foregår anonymt.
- Bred før dyb: byg alle hovedflows grundigt nok til en demo, før noget finpudses. Der skal altid være noget der kan afleveres.

## Arbejdsgang
- `docs/architecture.md` er sandheden for datamodel, routes og API-kontrakter. Ret den først, hvis noget ændres.
- Arbejd i feature-branches, små commits, PR til main.
- Kør reviewer-agenten før hvert trin afsluttes.

## Byggetrin
1. Skelet: login, roller (patient/tandlæge), navigation, design
2. Patientflow: spørgsmål, tekst + billedupload, AI-opsummering, send forespørgsel
3. Tandlægeflow: profil, indbakke, svar med prisinterval/tid/tilbud
4. Patientens oversigt over svar
5. Standard-sporet: tandlægeliste
6. Samtykke, beskedtråd, demodata, finpudsning

## Anmeldelser
- Trustpilot: vis score og link (angives på tandlægens profil). Ingen scraping af Trustpilot.
- Egne anmeldelser: kun fra patienter der har besøgt tandlægen via platformen (verificeret). Felter: stjerner, tekst, og "Svarede den endelige pris til prisoverslaget?" (ja / lidt højere / langt højere) med mulighed for at skrive den faktiske pris og om der manglede gennemsigtighed.
- Tandlægeprofilen viser en samlet "prisnøjagtighed" udregnet af disse svar.
- Tandlæger kan svare offentligt på anmeldelser. Anmeldelser modereres (ingen personhenførbare oplysninger om andre, ingen injurier).



<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
