import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/models/db/admin";
import { RateLimitRepository } from "@/models/rateLimitRepository";
import { ApiError } from "@/middleware/http";

// Rate limit pr. klient-IP og scope, 10 forsøg pr. time (architecture 7.6).
export const RATE_LIMIT_PER_HOUR = 10;

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
}

// Gemmer kun et hash af IP-adressen (dataminimering). Kaldes i routen før selve handlingen.
export async function enforceIpRateLimit(scope: string, req: Request): Promise<void> {
  const hash = createHash("sha256").update(clientIp(req)).digest("hex");
  if (!(await new RateLimitRepository(createSupabaseAdminClient()).consume(`${scope}:${hash}`, RATE_LIMIT_PER_HOUR))) {
    throw new ApiError(429, "RATE_LIMITED", "For mange forsøg. Prøv igen om lidt.");
  }
}
