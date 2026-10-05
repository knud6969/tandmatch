import { z } from "zod";
import { COSMETIC_CATEGORIES } from "@/lib/constants/categories";
import { CONSENT_TEXT_VERSIONS } from "@/lib/constants/consents";

// Trin 1: validerer input fra startsiden. Kategorien gemmes først, når kladden findes (trin 2).
export const anonymousSessionSchema = z
  .object({
    category: z.enum(COSMETIC_CATEGORIES),
    aiConsent: z
      .object({ textVersion: z.literal(CONSENT_TEXT_VERSIONS.ai_processing) })
      .strict(),
  })
  .strict();
