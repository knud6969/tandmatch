import { z } from "zod";

export const termsAcceptSchema = z
  .object({
    termsVersion: z.string().min(1).max(40),
    privacyVersion: z.string().min(1).max(40),
  })
  .strict();
