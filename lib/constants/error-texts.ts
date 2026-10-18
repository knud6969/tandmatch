import { MAX_BOOKINGS_PER_LEAD, NO_SHOW_GRACE_HOURS } from "@/lib/constants/bookings";

// Fejltekster, der bruges både af serveren (middleware/http.ts) og klienten (views/utils/api-errors.ts). Teksterne står
// kun her (architecture 2.1), så de ikke kan komme til at afvige fra hinanden.
export const CLINIC_NOT_VERIFIED_TEXT = "Din klinik er ikke verificeret endnu, så du kan ikke modtage henvendelser.";
export const THREAD_CLOSED_TEXT = "Samtalen er lukket, så der kan ikke skrives flere beskeder.";
export const MESSAGE_LIMIT_TEXT = "Du har sendt for mange beskeder i dag. Prøv igen i morgen.";

// Booking og anmeldelse (architecture 10.10, 10.13).
export const SLOT_TAKEN_TEXT = "Den tid blev lige optaget. Vælg en anden tid blandt de ledige tider herunder.";
export const SLOT_UNAVAILABLE_TEXT = "Klinikken kan ikke tage imod den tid. Vælg en anden tid.";
export const BOOKING_NOT_CANCELLABLE_TEXT = "Bookingen kan ikke aflyses længere. Genindlæs siden for at se den nyeste status.";
export const NO_SHOW_WINDOW_CLOSED_TEXT = `Udeblivelse kan kun registreres fra starttidspunktet og op til ${NO_SHOW_GRACE_HOURS} timer efter, at tiden er slut.`;
export const REVIEW_NOT_ALLOWED_TEXT = `Du kan ikke anmelde dette besøg. Du kan først anmelde, når der er gået ${NO_SHOW_GRACE_HOURS} timer efter tiden, og kun hvis besøget er gennemført.`;
export const BOOKING_LIMIT_TEXT = `Du har booket og aflyst for mange tider på denne henvendelse (højst ${MAX_BOOKINGS_PER_LEAD}). Skriv til klinikken i beskedtråden.`;
export const LEAD_NOT_ACCEPTED_TEXT = "Klinikken har ikke accepteret din henvendelse, eller der er allerede en tid. Genindlæs siden for at se status.";
export const ALREADY_REVIEWED_TEXT = "Du har allerede anmeldt dette besøg.";
export const ALREADY_REPLIED_TEXT = "Du har allerede svaret på denne anmeldelse. Genindlæs siden for at se svaret.";
