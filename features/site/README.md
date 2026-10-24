# Site (`features/site`)

Domænet dækker forsiden og informationssiderne.

- **Server:** `*Controller.ts`, `*Repository.ts`/`*Storage.ts`, `*Service.ts` direkte i mappen.
- **Web-UI:** `components/`, `pages/` (som `app/` videresender til) og `utils/`.
- **Grænseflade:** andre domæner importerer kun `index.ts` (server) og `ui.ts` (klientsikre komponenter).
- **Tests:** `__tests__/` (unit) og `__tests__/api/` (API).

Afsnittene nedenfor er flyttet uændret fra `docs/architecture.md` (oversigten). Numrene er bevaret, så henvisninger som "architecture 10.10" i koden stadig kan findes. Stier er opdateret til den nye struktur.

## 6. Sider og routes (App Router)

### 6.1 Offentlige sider

| Route | Indhold |
|---|---|
| `/` | Forside: kort forklaring af platformen, indgang til klinikoversigten ("Find en klinik" → `/klinikker`) og et udvalg af klinikker. Patientindgangene ("Beskriv dit problem", "Jeg har ondt") er fjernet 2026-10-22; patienter bruger appen |
| `/klinikker` | Klinikoversigt: liste + kort (Leaflet, OpenStreetMap) + filtre (ydelse, afstand/postnummer, maks. pris, min. bedømmelse, kun med ledig akuttid, kun klinikker, der kan kontaktes) og sortering (6.6). Weben vælger ikke klinikker til en sag; sammenligning og afsendelse af leads sker i patient-appen (architecture 13.6). Kortet viser de samme klinikker som listen. Filtre og sortering spejles i URL'en med samme nøgler som API'et (`features/clinics/utils/clinic-query.ts`), så profil/tilbage og deling bevarer dem; `akut=1` slår akutfilteret til. Postnummer og filtre står i URL'en; "Brug min position" (`lat`/`lng`) gør **ikke** (besluttet): positionen holdes kun i komponentens tilstand og sendes til API'et, men gemmes aldrig i URL'en eller på serveren. I akutvisningen henvises også til lægevagten uden for åbningstid, især når listen er tom, med den fælles tekst fra `lib/leads/constants/emergency.ts` (akutvejen ligger i appen). Bygget i 2.5 og 2.8 |
| `/klinikker/[clinicId]` | Klinikprofil: grunddata, åbningstider, kort, Trustpilot, anmeldelser og prisnøjagtighed. Verificerede også: beskrivelse, prisliste, første ledige tid, tandlæger med portefølje. Bygget i 2.6. Tilbagelinket bevarer oversigtens filtre. [PROTOTYPE]: siden hentes i browseren, så sidetitlen er generisk, og en ukendt eller skjult klinik giver en fejlside med HTTP 200 i stedet for 404; serverside-hentning med titel og 404 kommer senere |
| `/login`, `/opret`, `/opret/klinik` | Login og signup for klinikker (`/opret` henviser patienter til appen). `/opret/klinik` beder om CVR, klinikkens navn, adresse, postnummer, by, telefon. Teksten må ikke antyde, at CVR slås op i CVR-registret (det gør vi ikke); den forklarer, at CVR bruges til at knytte kontoen til klinikken og til verifikation |
| `/saadan-virker-det`, `/saadan-tjener-vi-penge`, `/for-klinikker`, `/om-os`, `/kontakt` | Informationssider (statisk indhold, ingen API; bygget i 2.4). "Sådan tjener vi penge" beskriver prototypens model: klinikker betaler for leads, patienter betaler ikke (forretningsmodellen er åben, 12.3 punkt 31). Weben har ingen indgang til chatten; patienter bruger appen. |
| `/vilkaar/accepter`, `/vilkaar`, `/privatliv` | Vilkårs-gaten og tekster (2.5). Bygget |
