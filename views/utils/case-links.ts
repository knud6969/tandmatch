import type { CaseDto } from "@/lib/types/cases";

// Link til klinikoversigten med sagens behandlinger og postnummer forvalgt (architecture 6.1).
export function clinicsHref(caseDto: Pick<CaseDto, "id" | "services" | "postalCode">): string {
  const params = new URLSearchParams({ sag: caseDto.id });
  if (caseDto.services.length > 0) params.set("services", caseDto.services.map((s) => s.slug).join(","));
  if (caseDto.postalCode) params.set("postalCode", caseDto.postalCode);
  return `/klinikker?${params.toString()}`;
}

export const sendHref = (caseId: string, clinicIds: string[]) => `/start/${caseId}/send?klinikker=${clinicIds.join(",")}`;
export const caseHref = (caseId: string) => `/patient/sag/${caseId}`;
// Sagens flow (beskrivelse, behandlinger, opsummering) på /start/<id>.
export const caseFlowHref = (caseId: string) => `/start/${caseId}`;
// Klinikoversigten for en sag uden andre filtre (fx når sagen ikke kan hentes).
export const caseDirectoryHref = (caseId: string) => `/klinikker?sag=${caseId}`;
// Patientens booking af et accepteret lead og oversigten over alle bookinger (architecture 6.2).
export const bookHref = (caseId: string, leadId: string) => `/patient/sag/${caseId}/book/${leadId}`;
export const BOOKINGS_HREF = "/patient/bookinger";
