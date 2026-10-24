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

Alt kode i repoet er committet af mig, Knud Aundal. Størstedelen af koden er skrevet med Claude Code under min styring af krav, arkitektur og test, men det er ikke helt færdigt endnu, da vi har pivoteret flere gange og jeg tit løber tør for tokens. Den bedømte app til aflevering i GK2 ligger i /mobile mappen.

## Godkendelsesopgave 2 — INNT E26

Denne app er udviklet som del af Godkendelsesopgave 2 i faget Innovation og Ny Teknologi. Den bygger videre på Lægetider fra Godkendelsesopgave 1, men er pivoteret til tandlæger på baggrund af feedback og interviews med speciallæger. Appen er en prototype og ikke helt færdig. Billeder i chatten, kort, booking og anmeldelse i appen er ikke bygget endnu og derudover er filstruktur, diverse features, frontend design heller ikke færdigt, da der stadig skal laves en del ændringer, men den overordnede ide om en web baseret applikation til klinikker og en mobilbaseret app og de features der er på hver især forbliver det samme frem til det endelige eksamensprojekt.