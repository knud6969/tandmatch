// Indgange i den offentlige navigation. Hver rute har en konstant, så headeren aldrig linker til en side, der ikke findes.

// Chat-indgangen ("Beskriv dit problem"). Sagsflowet bor på /start (architecture 6.1), bygget i opgave 3.4.
export const CHAT_HREF = "/start";

// Akutvejen (architecture 6.1 `/akut`, opgave 7.4): "Jeg har ondt" på forsiden og akut-blokken i chatten.
export const EMERGENCY_HREF = "/akut";

// Klinikoversigten (opgave 2.5). Sæt DIRECTORY_READY til false for at skjule indgangene.
export const DIRECTORY_HREF = "/klinikker";
export const DIRECTORY_READY = true;
