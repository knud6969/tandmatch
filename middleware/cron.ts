import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

// Beskytter /api/cron/*. Sammenligner SHA-256-hashes i konstant tid. Mangler CRON_SECRET, afvises alt.
export function isValidCronRequest(authorizationHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16 || !authorizationHeader) {
    return false;
  }
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const received = createHash("sha256").update(authorizationHeader).digest();
  return timingSafeEqual(expected, received);
}
