import type { CaseStatus } from "@/lib/cases/types/cases";
import type { PatientBookingDto } from "@/lib/booking/types/bookings";
import { isThreadOpen } from "@/lib/leads/domain/leads";
import type { PatientLeadDto } from "@/lib/leads/types/leads";

// Sags- og bookinghandlinger med bekræftelse (architecture 13.4). Hvornår en handling tilbydes, følger serverens regler;
// serveren er den endelige vagt (LEAD_NOT_PENDING, BOOKING_NOT_CANCELLABLE).

// "Træk tilbage" kun, mens klinikken ikke har svaret.
export const canWithdrawLead = (lead: Pick<PatientLeadDto, "status" | "clinic">) => lead.status === "sent" && !lead.clinic.removed;

// "Luk sag" for en sendt sag; en kladde slettes i sagsflowet, og en lukket sag er allerede lukket.
export const canCloseCase = (status: CaseStatus) => status === "submitted";

// "Aflys" følger serverens `canCancel` (booket og før starttid); "Anmeld" følger `canReview` (gennemført og endnu ikke anmeldt).
export const canCancelBooking = (booking: Pick<PatientBookingDto, "canCancel">) => booking.canCancel;
export const canReviewBooking = (booking: Pick<PatientBookingDto, "canReview">) => booking.canReview;

// Skriv til klinikken, så længe tråden er åben og klinikken stadig findes.
export const canMessageLead = (lead: Pick<PatientLeadDto, "status" | "clinic">) => !lead.clinic.removed && isThreadOpen(lead.status);

// "Skriv til klinikken" med antal ulæste, fx "Skriv til klinikken (2 nye)".
export function messagesLabel(unread: number): string {
  return unread > 0 ? `Skriv til klinikken (${unread} ${unread === 1 ? "ny" : "nye"})` : "Skriv til klinikken";
}
