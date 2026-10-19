import { CONSENT_TEXT_VERSIONS } from "@/lib/constants/consents";
import type { ConsentType } from "@/lib/types/common";
import type { ConsentDto } from "@/lib/types/consents";
import { apiRequest } from "./client";

// Patientens samtykker (architecture 10.3).
export async function getConsents(): Promise<ConsentDto[]> {
  const result = await apiRequest<{ consents: ConsentDto[] }>("/api/consents");
  return result.consents;
}

// Giver samtykke i den gældende tekstversion. Aldrig forudafkrydset: kaldes kun efter patientens eget tryk.
export function grantConsent(type: ConsentType): Promise<unknown> {
  return apiRequest("/api/consents", { method: "POST", json: { type, textVersion: CONSENT_TEXT_VERSIONS[type] } });
}
