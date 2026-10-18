// Fejltekster, der bruges både af serveren (middleware/http.ts) og klienten (views/utils/api-errors.ts). Teksterne står
// kun her (architecture 2.1), så de ikke kan komme til at afvige fra hinanden.
export const CLINIC_NOT_VERIFIED_TEXT = "Din klinik er ikke verificeret endnu, så du kan ikke modtage henvendelser.";
export const THREAD_CLOSED_TEXT = "Samtalen er lukket, så der kan ikke skrives flere beskeder.";
export const MESSAGE_LIMIT_TEXT = "Du har sendt for mange beskeder i dag. Prøv igen i morgen.";
