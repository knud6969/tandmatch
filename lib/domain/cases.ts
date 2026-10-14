import { MAX_ACTIVE_LEADS_PER_CASE } from "@/lib/constants/limits";
import type { CaseRecordDto } from "@/lib/types/cases";

// Kan sagen sendes videre til flere klinikker? Kladde med godkendt opsummering, postnummer, tidsrum og mindst én
// bekræftet ydelse, og plads til flere aktive leads. Kontoen og samtykket tjekkes ved afsendelsen (trin 4).
export function canSendCase(
  record: Pick<CaseRecordDto, "status" | "summaryApprovedAt" | "postalCode" | "preferredTimeframe">,
  serviceCount: number,
  activeLeadCount: number,
): boolean {
  return (
    record.status === "draft" &&
    record.summaryApprovedAt !== null &&
    record.postalCode !== null &&
    record.preferredTimeframe !== null &&
    serviceCount > 0 &&
    activeLeadCount < MAX_ACTIVE_LEADS_PER_CASE
  );
}
