import type { CaseStatus } from "@/lib/cases/types/cases";
import type { PatientBookingDto } from "@/lib/booking/types/bookings";
import type { PatientLeadDto } from "@/lib/leads/types/leads";

// Sags- og bookinghandlinger med bekræftelse (architecture 13.4). Hvornår en handling tilbydes, følger serverens regler;
// serveren er den endelige vagt (LEAD_NOT_PENDING, BOOKING_NOT_CANCELLABLE).

// Konsekvensen af at lukke en sag, som patienten ser før bekræftelsen (architecture 6.2).
// [BYGGET I APPEN] Konstanten findes endnu ikke i lib/ (7.12b); flyttes dertil, så web og app deler den.
export const CLOSE_CASE_CONSEQUENCE =
  "Henvendelser, som klinikken ikke har svaret på, og accepterede henvendelser uden booket tid trækkes tilbage, og en reserveret akuttid frigives. Bookede tider består; du kan aflyse dem under Bookinger.";

export const WITHDRAW_LEAD_CONSEQUENCE = "Klinikken ser kun, at henvendelsen er trukket tilbage, ikke din beskrivelse. Du kan vælge en anden klinik i stedet.";
export const CANCEL_BOOKING_CONSEQUENCE = "Tiden frigives, og klinikken får besked om aflysningen. Du kan booke en ny tid, hvis henvendelsen stadig er åben.";

// "Træk tilbage" kun, mens klinikken ikke har svaret.
export const canWithdrawLead = (lead: Pick<PatientLeadDto, "status" | "clinic">) => lead.status === "sent" && !lead.clinic.removed;

// "Luk sag" for en sendt sag; en kladde slettes i sagsflowet, og en lukket sag er allerede lukket.
export const canCloseCase = (status: CaseStatus) => status === "submitted";

// "Aflys" følger serverens `canCancel` (booket og før starttid); "Anmeld" følger `canReview` (gennemført og endnu ikke anmeldt).
export const canCancelBooking = (booking: Pick<PatientBookingDto, "canCancel">) => booking.canCancel;
export const canReviewBooking = (booking: Pick<PatientBookingDto, "canReview">) => booking.canReview;

// Skriv til klinikken, så længe tråden er åben og klinikken stadig findes.
export const canMessageLead = (lead: Pick<PatientLeadDto, "status" | "clinic">) =>
  !lead.clinic.removed && (lead.status === "sent" || lead.status === "accepted" || lead.status === "booked");

// "Skriv til klinikken" med antal ulæste, fx "Skriv til klinikken (2 nye)".
export function messagesLabel(unread: number): string {
  return unread > 0 ? `Skriv til klinikken (${unread} ${unread === 1 ? "ny" : "nye"})` : "Skriv til klinikken";
}
