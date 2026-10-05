import { z } from "zod";
import { CONSENT_TYPES } from "@/lib/constants/consents";

export const grantConsentSchema = z
  .object({
    type: z.enum(CONSENT_TYPES),
    textVersion: z.string().min(1).max(80),
  })
  .strict();
