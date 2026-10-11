# TandMatch

TandMatch hjælper patienter med at finde den rigtige tandklinik til en fair pris, og giver klinikkerne gode kunder. Platformen virker på både mobil og computer. Gruppeprojekt på INNT (CBS).

## Idéen kort
- **For patienten:** let og gennemsigtigt. Man beskriver sit problem, ser hvad det koster hos forskellige klinikker, hvad andre siger om dem, og booker en tid.
- **For klinikken:** kunder, der allerede ved, hvad de vil have, og som har set prisen. Klinikken skal bruge så lidt tid som muligt pr. henvendelse.

## Sådan virker det for patienten
1. Patienten kommer ind på forsiden og kan enten:
   - **chatte med vores AI** og beskrive sit problem med ord og billeder (kan gøres uden login), eller
   - **gå direkte til oversigten** over klinikker med liste, kort og filtre (lidt som Airbnb).
2. AI'en spørger ind, indtil den forstår, hvad patienten har brug for, og foreslår de ydelser, der passer. Patienten bekræfter selv.
3. Patienten sammenligner klinikker på pris (fra klinikkens egen prisliste), anmeldelser, prisnøjagtighed, afstand og første ledige tid.
4. Patienten opretter en konto og kontakter **op til 3 klinikker**. Hver henvendelse er et **lead** til klinikken.
5. Klinikken accepterer eller afviser. Har den accepteret, kan patienten **booke en tid** i klinikkens kalender.
6. Efter besøget kan patienten skrive en anmeldelse.

Har patienten ondt, er der en hurtig vej direkte til klinikker med en ledig akuttid.

## Sådan virker det for klinikken
- Klinikken har **én konto**. Klinikkens tandlæger vises på profilen med billeder af deres arbejde.
- Klinikken udfylder sin profil én gang: priser på alle ydelser, åbningstider og billeder.
- Et lead skal kunne klares på **under et minut**: ét overblik og knapperne *Accepter*, *Accepter med kommentar* eller *Afvis*.
- Klinikker, der ikke har oprettet sig, vises med grundoplysninger (adresse, placering på kortet, kontaktinfo, åbningstider og Trustpilot, hvis vi kender den), men kan ikke modtage leads. Egne anmeldelser findes kun for verificerede klinikker, fordi de kræver en booking. Klinikker, der har oprettet sig, får priser, billeder og leads, og det er deres fordel. Præcis hvad der vises, designes senere.

## Teknik
Next.js (App Router, TypeScript), Tailwind, Supabase (Postgres, Auth, Storage, Row Level Security) og OpenAI, der kun kaldes fra serveren.

Koden er bygget som **MVC**, og det skal den blive ved med. Backend er **objektorienteret**: models, services og controllers er klasser med fælles basisklasser, så logik genbruges i stedet for at blive kopieret. Lagene og mapperne er beskrevet i `docs/architecture.md` (afsnit 2), og `npm run lint` fejler, hvis reglerne brydes.

## Faste regler
- **Mobil først.** Tjek altid layoutet ved 390 px og 1280 px bredde.
- **Dansk:** al tekst i appen er på dansk.
- **Hemmelige nøgler** ligger kun i `.env.local` og bruges kun på serveren. Aldrig i browseren og aldrig i git. Kun `.env.example` committes.
- **AI'en:**
  - må stille spørgsmål, forklare behandlinger og give en **foreløbig vurdering**, men skal altid sige, at klinikken laver den endelige vurdering
  - nævner **aldrig priser** og **anbefaler aldrig en bestemt klinik**; priserne kommer fra klinikkernes prislister, og rækkefølgen af klinikker bestemmes af faste kriterier
  - henviser straks til en akuttid ved tegn på noget akut
  - har sine regler samlet ét sted i koden (`services/ai/`), så de kan strammes ind senere. Det bliver nødvendigt for at overholde EU's regler om medicinsk udstyr (MDR), før rigtige patienter bruger platformen.
- **Klinikker kan aldrig se hinandens leads, svar eller patienter.** Det sikres i databasen (Row Level Security), ikke kun i appen.
- **Kontaktoplysninger:** al kontakt går gennem platformen. Klinikken ser først patientens navn og kontaktoplysninger, når leadet er accepteret og en tid er booket.
- **Billeder og helbredsdata:** billeder af munden er helbredsdata (GDPR art. 9). De må kun uploades, når patienten har givet samtykke (gemmes med tidspunkt). Patienten kan chatte og uploade uden login, men skal have en konto, før noget sendes til en klinik.
- **Bred før dyb:** byg hele rejsen enkelt, så den kan vises frem, før noget finpudses. Der skal altid være noget, der kan afleveres.

## Anmeldelser
- **Egne anmeldelser** kan kun skrives af patienter, der har haft en tid hos klinikken via platformen. Felter: stjerner, tekst og "Svarede den endelige pris til prisoverslaget?" (ja / lidt højere / langt højere). Patienten kan også skrive den faktiske pris, og om der manglede gennemsigtighed.
- Klinikprofilen viser en samlet **prisnøjagtighed** beregnet ud fra disse svar.
- Klinikken kan svare offentligt på anmeldelser. Anmeldelser modereres (ingen personoplysninger om andre, ingen injurier).
- **Trustpilot:** vis klinikkens score og et link, som klinikken selv angiver. Trustpilot må ikke scrapes.

## Arbejdsgang
- `docs/architecture.md` bestemmer, hvordan tingene er bygget (datamodel, sider og API). Skal noget ændres, rettes dokumentet først.
- Arbejd i feature-branches med små commits og PR til main.
- Når et byggetrin er færdigt, køres **reviewer**- og **tester**-agenten. **Security**-agenten køres ved ændringer i login, databaseregler og billeder, før merge til main og før demo.

## Byggetrin
1. Ydelseskatalog, klinikprofil med prisliste, åbningstider og tandlæger
2. Forside, klinikoversigt med kort, filtre og klinikprofil
3. AI-chat med billeder, forslag til ydelser og opsummering
4. Sammenligning og leads til op til 3 klinikker
5. Klinikkens indbakke: accepter eller afvis
6. Booking i klinikkens kalender og anmeldelser efter besøget
7. Akutvej, demodata og finpudsning

