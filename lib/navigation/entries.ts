// Indgange i den offentlige navigation. Hver rute har en konstant, så headeren aldrig linker til en side, der ikke findes.

// Chat-indgangen ("Beskriv dit problem"). MIDLERTIDIGT peger den på forsiden; sættes til "/chat", når chatten bygges (trin 3).
export const CHAT_HREF = "/";

// Klinikoversigten. Bygges i trin 2 (opgave 2.5). Sæt DIRECTORY_READY til true, når /klinikker findes.
export const DIRECTORY_HREF = "/klinikker";
export const DIRECTORY_READY = false;
