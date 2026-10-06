import { z } from "zod";
import { COSMETIC_CATEGORIES } from "@/lib/constants/categories";
import { CONSENT_TEXT_VERSIONS } from "@/lib/constants/consents";

// Validerer input fra /start: kategori og AI-samtykke. Billedsamtykke gives ikke her, men i billedtrinnet (architecture 0.7, 9.4).
export const anonymousSessionSchema = z
  .object({
    category: z.enum(COSMETIC_CATEGORIES),
    aiConsent: z
      .object({ textVersion: z.literal(CONSENT_TEXT_VERSIONS.ai_processing) })
      .strict(),
  })
  .strict();
