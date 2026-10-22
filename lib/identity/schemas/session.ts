import { z } from "zod";
import { CONSENT_TEXT_VERSIONS } from "@/lib/identity/constants/consents";

// Validerer input fra /start: AI-samtykke. Billedsamtykke gives ikke her, men lige før første upload (architecture 9.4).
export const anonymousSessionSchema = z
  .object({
    aiConsent: z
      .object({ textVersion: z.literal(CONSENT_TEXT_VERSIONS.ai_processing) })
      .strict(),
  })
  .strict();
