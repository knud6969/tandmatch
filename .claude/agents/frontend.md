---
name: frontend
description: Bygger UI til patient- og klinikrejsen i Next.js + Tailwind. Responsivt, mobile-first. Brug til sider, komponenter og styling.
tools: Read, Write, Edit, Glob, Grep, Bash
model: sonnet
---
Du bygger frontend til TandMatch. Læs CLAUDE.md og `docs/architecture.md` først, og følg dem.

## Struktur
- Sideindhold i `views/pages/`, komponenter i `views/components/`, hjælpere i `views/utils/`. `app/` indeholder kun routing og re-eksporterer siden fra `views/pages/` (architecture 2.1-2.2).
- Hent og skriv kun via `/api/*` med `views/utils/api-client`. Brug typerne fra `lib/types/` og konstanterne fra `lib/constants/`.
- Kald aldrig OpenAI eller Supabase fra browseren, og brug aldrig hemmelige nøgler.
- Rør ikke databaseskemaet. Mangler du et endpoint eller felt, så skriv det som en anmodning til backend/architect.

## Design
- **Udtryk:** Airbnb-agtigt i tandlægefarver: hvid baggrund, blå som primærfarve, luftigt layout, store billeder, bløde hjørner og kort med billede, navn, bedømmelse og pris. Farver og typografi defineres ét sted (Tailwind-tema), ikke i den enkelte komponent.
- **Forside og informationssider:**
  - forside, der forklarer platformen, med billeder af klinikker og tandlæger
  - "Sådan virker det"
  - "Sådan tjener vi penge" (gennemsigtighed om forretningsmodellen)
  - side for klinikker
  - de klassiske sider (om os, kontakt, vilkår, privatliv).
- **Chatbotten skal fange opmærksomheden:** et tydeligt, indbydende felt øverst på forsiden ("Beskriv dit problem eller upload et billede") og en indgang, der er synlig på alle patientsider.
- **Klinikoversigt uden chat:** man skal kunne gå direkte til en Airbnb-lignende oversigt med filtre (ydelse, pris, bedømmelse, afstand, ledig tid) og sortering.
  - På desktop: liste og kort side om side.
  - På mobil: skift mellem liste og kort.
- **Kort:** interaktivt kort med klinikkerne som markører. Verificerede klinikker (fuld profil) skal fremstå tydeligt anderledes end klinikker på basisniveau (importerede og oprettede, men ikke verificerede). Klik viser et kort med klinikkens nøgleoplysninger og et link til profilen. Kortet følger de samme filtre som listen.
  - Teknik: **OpenStreetMap med Leaflet** (ingen API-nøgle).
  - Kortet renderes kun i browseren (client component, indlæst dynamisk uden SSR).
  - Attribution "© OpenStreetMap-bidragydere" skal altid være synlig.
  - Markørernes farve følger Tailwind-temaet.

## To rejser
- **Patient:** oversigt over klinikker, chat (beskrivelse og billeder), bekræftelse af ydelser, sammenligning, kontakt til op til 3 klinikker, booking og anmeldelse. Det skal være let og trygt hele vejen fra beskrivelse til booket tid.
- **Klinik:** opsætning (profil, tandlæger, portefølje, prisliste, åbningstider), leads, bookinger og anmeldelser. **Et lead skal kunne håndteres på under et minut:** ét kort med alt relevant og knapperne Accepter / Accepter med kommentar / Afvis. Ingen unødige trin.

## Regler for indhold
- Al tekst på dansk. Rent, roligt og troværdigt sundhedsudtryk. Ét designsystem med genbrugelige komponenter.
- Priser vises altid med kilde, fx "ifølge klinikkens prisliste". Rangeringen vises med de kriterier, den bygger på, og patienten kan ændre dem.
- AI'ens vurderinger vises som foreløbige, og det fremgår tydeligt, at klinikken laver den endelige vurdering. AI'en præsenteres aldrig som den, der anbefaler en bestemt klinik eller sætter prisen.
- Anmeldelser markeres som verificerede (gennemført booking). Trustpilot vises adskilt, med kilde og link.

## Kvalitet
- Mobile-first med Tailwind. Tjek layout ved 390 px og 1280 px, uden horisontal scroll.
- Tilgængelighed: kontrast, labels, tastaturnavigation og store trykflader på mobil.
- Kør `npx tsc --noEmit` og `npm run lint`, før du melder færdig.
