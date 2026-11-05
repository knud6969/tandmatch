# TandMatch

En React Native (Expo) app til at finde den rigtige tandklinik til en fair pris. Patienten beskriver sit problem til en AI-chat, ser klinikker med priser, bedømmelser og afstand, og sender sin henvendelse til op til tre klinikker.

## Kør projektet

Appen ligger i mappen mobile og kræver, at serveren i roden kører.

```bash
# 1. Server og database (i roden)
cp .env.example .env.local      # udfyld Supabase- og OpenAI-nøgler
npm install
supabase start
supabase db reset
npm run seed:demo
npm run dev -- -H 0.0.0.0

# 2. Appen (i et nyt terminalvindue)
cd mobile
npm install
cp .env.example .env            # sæt EXPO_PUBLIC_API_URL=http://127.0.0.1:3000
npx expo start
tryk i for at åbne ios simulation på computer
```

På en rigtig iPhone i Expo Go skal EXPO_PUBLIC_API_URL i stedet være http://<computerens IP>:3000.


## Video + Github

https://github.com/knud6969/tandmatch

https://www.loom.com/share/3101b57a964f4b85bbfc66378a6de7fc

## Hvem har kodet hvad

Alt kode i repoet er committet af mig, Knud Aundal. Størstedelen af koden er skrevet med Claude Code under min styring af krav, arkitektur og test, men det er ikke helt færdigt endnu, da vi har pivoteret flere gange og jeg tit løber tør for tokens. Den bedømte app til aflevering i GK2 ligger i /mobile mappen. Klinikkernes webside, API'et og databasen ligger i resten af repoet.

## Godkendelsesopgave 2 — INNT E26

Denne app er udviklet som del af Godkendelsesopgave 2 i faget Innovation og Ny Teknologi. Den bygger videre på Lægetider fra Godkendelsesopgave 1, men er pivoteret til tandlæger på baggrund af feedback og interviews med speciallæger. Appen er en prototype med fiktive data og ikke rigtige patienter. Patientens rejse er bygget i appen: AI-chat med billeder, klinikoversigt med liste, kort og filtre, klinikprofil med prisliste og anmeldelser, gemte klinikker, henvendelser til op til tre klinikker, beskeder, booking, flytning og aflysning af tid, tilføjelse til kalenderen, anmeldelse efter besøget, akutvej og notifikationer (push og klokke). Klinikkens webside har profil og prisliste, indbakke, kalender, anmeldelser, statistik og notifikationer, og der er en adminside til moderation. Det er stadig en prototype: leverandører uden aftaler (bl.a. e-mail, push og SMS), AI'ens regler efter EU's MDR-regler, opbevaringsperioder, drift og finpudsning af design og struktur mangler, så den overordnede idé forbliver den samme frem til det endelige eksamensprojekt.