import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/server/db/admin";
import { ApiError } from "@/server/http/api";

// Rate limit pr. klient-IP og scope, 10 forsøg pr. time (architecture 7.6).
// Tælleren ligger i tabellen rate_limits og opdateres atomisk af consume_rate_limit() i databasen.
// Begrundelse: serverless-funktioner deler ikke hukommelse, så en in-memory limiter ville ikke virke i drift.
export const RATE_LIMIT_PER_HOUR = 10;

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
}

// Gemmer kun et hash af IP-adressen (dataminimering). Kaldes før selve handlingen.
export async function enforceIpRateLimit(scope: string, req: Request): Promise<void> {
  const hash = createHash("sha256").update(clientIp(req)).digest("hex");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("consume_rate_limit", {
    p_key: `${scope}:${hash}`,
    p_limit: RATE_LIMIT_PER_HOUR,
  });
  if (error) {
    throw new Error("consume_rate_limit fejlede");
  }
  if (data !== true) {
    throw new ApiError(429, "RATE_LIMITED", "For mange forsøg. Prøv igen om lidt.");
  }
}
