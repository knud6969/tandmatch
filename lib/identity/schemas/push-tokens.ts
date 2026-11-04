import { z } from "zod";
import { PUSH_PLATFORMS, PUSH_TOKEN_PATTERN } from "@/lib/identity/constants/push-tokens";

export const registerPushTokenSchema = z
  .object({
    token: z.string().regex(PUSH_TOKEN_PATTERN, "Ugyldigt push-token."),
    platform: z.enum(PUSH_PLATFORMS),
  })
  .strict();

export const deletePushTokenSchema = z.object({ token: z.string().min(1).max(250) }).strict();
