import { CONSENT_TEXT_VERSIONS } from "@/lib/constants/consents";
import type { ConsentType } from "@/lib/types/common";
import type { ConsentDto } from "@/lib/types/consents";
import { apiRequest } from "@/views/utils/api-client";

// Patientens samtykker (architecture 4.3, 10.3). Stabil funktion, så den kan gives direkte til useLoad.
export const loadConsents = async (): Promise<ConsentDto[]> => (await apiRequest<{ consents: ConsentDto[] }>("/api/consents")).consents;

// Har patienten et aktivt samtykke i den gældende tekstversion?
export function hasCurrentConsent(consents: ConsentDto[], type: ConsentType): boolean {
  return consents.some((c) => c.type === type && c.withdrawnAt === null && c.textVersion === CONSENT_TEXT_VERSIONS[type]);
}
