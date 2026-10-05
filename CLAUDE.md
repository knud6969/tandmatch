# TandMatch

Webplatform (mobil + pc) hvor patienter beskriver et tandproblem, og tandlæger svarer med personlig vurdering, prisinterval, første ledige tid og tilbud. Gruppeprojekt på INNT (CBS).

## To spor
1. **Kosmetisk/elektiv** (diastema, facing, blegning, retainer m.m.): patienten sender en forespørgsel, matchende tandlæger svarer individuelt.
2. **Standard/akut**: patienten ser en liste over tandlæger sorteret efter afstand, næste ledige tid, prisinterval for standardydelser og anmeldelser. Ingen individuelle svar.

Patienten vælger selv spor. AI'en vælger det ikke.

## Stack
Next.js (App Router, TypeScript), Tailwind, Supabase (Postgres, Auth, Storage, Row Level Security), OpenAI API kaldt fra server-routes.

## Faste regler
- Mobile-first. Tjek altid layout ved 390 px og 1280 px bredde.
- Al UI-tekst på dansk.
- API-nøgler kun i `.env.local` og kun brugt server-side. Aldrig i frontend-kode, aldrig i git. Commit kun `.env.example`.
- **AI-guardrail:** AI'en beskriver og strukturerer. Den må ALDRIG diagnosticere, vurdere alvorlighed, foreslå behandling eller anslå pris ud fra billeder/tekst. Hvis brugeren spørger om det, svarer den at det er tandlægens opgave. Dette er for at undgå at produktet bliver et medicinsk device (EU MDR).
- Tandlæger kan aldrig se hinandens svar. Håndhæves med Row Level Security i databasen, ikke kun i UI.
- Billeder må kun uploades efter eksplicit samtykke fra patienten (gemmes med tidspunkt). Fotos af munden er helbredsdata (GDPR art. 9).
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
