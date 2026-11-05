import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError, jsonResponse, withApi } from "@/platform/middleware/http";

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

// Fælles for alle /api/cron/*-routes: afviser uden gyldig CRON_SECRET (401), ellers svarer med jobbets resultat.
export function cronRoute(run: () => Promise<unknown>) {
  return withApi(async (req) => {
    if (!isValidCronRequest(req.headers.get("authorization"))) {
      throw new ApiError(401, "UNAUTHORIZED", "Ikke autoriseret.");
    }
    return jsonResponse(await run());
  });
}
