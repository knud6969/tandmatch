import { z } from "zod";
import { WEB_PUSH_AUTH_PATTERN, WEB_PUSH_P256DH_PATTERN } from "@/lib/clinics/constants/web-push";
import { isAllowedWebPushEndpoint } from "@/lib/clinics/domain/web-push";

const endpoint = z.string().refine(isAllowedWebPushEndpoint, "Ugyldigt abonnement.");

// Samme form som PushSubscription.toJSON() i browseren (uden expirationTime).
export const registerWebPushSchema = z
  .object({
    endpoint,
    keys: z.object({ p256dh: z.string().regex(WEB_PUSH_P256DH_PATTERN), auth: z.string().regex(WEB_PUSH_AUTH_PATTERN) }).strict(),
  })
  .strict();

export const deleteWebPushSchema = z.object({ endpoint: z.string().min(1).max(500) }).strict();
