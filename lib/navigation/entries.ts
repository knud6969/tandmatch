// Indgange i den offentlige navigation. Hver rute har en konstant, så headeren aldrig linker til en side, der ikke findes.

// Chat-indgangen ("Beskriv dit problem"). Sagsflowet bor på /start (architecture 6.1) og bygges i trin 3 (opgave 3.4).
// Indtil da er indgangen skjult. Sæt CHAT_READY til true, når /start findes.
export const CHAT_HREF = "/start";
export const CHAT_READY = false;

// Klinikoversigten. Bygges i trin 2 (opgave 2.5). Sæt DIRECTORY_READY til true, når /klinikker findes.
export const DIRECTORY_HREF = "/klinikker";
export const DIRECTORY_READY = false;
