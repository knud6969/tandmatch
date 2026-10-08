import "server-only";
import { createSupabaseAdminClient } from "@/models/db/admin";

// Tælleren ligger i tabellen rate_limits og opdateres atomisk af consume_rate_limit() i databasen.
// Begrundelse: serverless-funktioner deler ikke hukommelse, så en in-memory limiter ville ikke virke i drift.
// Returnerer false, når grænsen er nået.
export async function consumeRateLimit(key: string, limit: number): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("consume_rate_limit", { p_key: key, p_limit: limit });
  if (error) {
    throw new Error("consume_rate_limit fejlede");
  }
  return data === true;
}
