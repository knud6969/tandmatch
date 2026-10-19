import { CONSENT_TEXT_VERSIONS } from "@/lib/constants/consents";
import type { ConsentType } from "@/lib/types/common";
import type { ConsentDto } from "@/lib/types/consents";

// Har patienten et aktivt samtykke i den gældende tekstversion? (architecture 4.3). Delt af web og patient-appen.
export function hasCurrentConsent(consents: ConsentDto[], type: ConsentType): boolean {
  return consents.some((c) => c.type === type && c.withdrawnAt === null && c.textVersion === CONSENT_TEXT_VERSIONS[type]);
}
