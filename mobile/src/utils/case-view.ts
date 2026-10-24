import { CASE_STATUS_LABEL } from "@/lib/cases/constants/cases";
import type { PatientBookingDto } from "@/lib/booking/types/bookings";
import type { CaseListItemDto } from "@/lib/cases/types/cases";
import { LEAD_DECLINE_REASON_LABEL, LEAD_STATUS_LABEL } from "@/lib/leads/constants/leads";
import type { LeadStatus, PatientLeadDto } from "@/lib/leads/types/leads";

// Visning af sager og leads (architecture 13.4). Teksterne for sager, leads og bookinger kommer fra lib.

export type Tone = "info" | "success" | "warning" | "danger";

export function leadTone(status: LeadStatus): Tone {
  if (status === "accepted" || status === "booked") return "success";
  if (status === "declined") return "danger";
  if (status === "withdrawn") return "warning";
  return "info";
}

// Sagens titel i listen: behandlingerne, ellers en neutral tekst.
export function caseTitle(item: Pick<CaseListItemDto, "serviceNames" | "isEmergency">): string {
  if (item.serviceNames.length > 0) return item.serviceNames.join(", ");
  return item.isEmergency ? "Akut henvendelse" : "Sag uden valgte behandlinger";
}

// Hvor sagen står: uden leads er det sagens egen status; ellers tælles leads pr. status ("1 afventer svar, 1 accepteret").
export function caseStatusLine(item: Pick<CaseListItemDto, "status" | "leads">): string {
  const leads = item.leads;
  if (leads.length === 0) return CASE_STATUS_LABEL[item.status];
  const counts = new Map<LeadStatus, number>();
  for (const lead of leads) counts.set(lead.status, (counts.get(lead.status) ?? 0) + 1);
  return [...counts.entries()].map(([status, n]) => `${n} ${LEAD_STATUS_LABEL[status].toLowerCase()}`).join(", ");
}

// Et kladdesag fortsættes i samtalen; en sendt eller lukket sag åbner sagsskærmen.
export const caseRoute = (item: Pick<CaseListItemDto, "id" | "status">) =>
  item.status === "draft" ? ({ pathname: "/sag/[caseId]/flow", params: { caseId: item.id } } as const) : ({ pathname: "/sag/[caseId]", params: { caseId: item.id } } as const);

// Kun et accepteret lead kan bookes (et booket lead har allerede sin tid).
export const canBookLead = (lead: Pick<PatientLeadDto, "status" | "clinic">) => lead.status === "accepted" && !lead.clinic.removed;

// Afvisningsårsagen på et lead, med klinikkens note, hvis der er en.
export function declineText(lead: Pick<PatientLeadDto, "declineReason" | "declineNote">): string | null {
  if (!lead.declineReason) return null;
  const reason = LEAD_DECLINE_REASON_LABEL[lead.declineReason];
  return lead.declineNote ? `${reason}: ${lead.declineNote}` : reason;
}

// Farven på en bookings status: bekræftet er grøn, gennemført blå, resten (aflyst, udeblevet) gul.
export function bookingTone(status: PatientBookingDto["status"]): Tone {
  if (status === "booked" || status === "held") return "success";
  return status === "completed" ? "info" : "warning";
}
