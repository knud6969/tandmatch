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

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
