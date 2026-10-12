import { ApiError, jsonResponse, withApi } from "@/middleware/http";
import { isValidCronRequest } from "@/middleware/cron";
import { CronController } from "@/controllers/cronController";

// Sletter anonyme sessioner 48 timer efter sidste aktivitet (architecture 7.7).
// Beskyttet med CRON_SECRET i Authorization-headeren. Ingen persondata i svar eller logs.
export const POST = withApi(async (req) => {
  if (!isValidCronRequest(req.headers.get("authorization"))) {
    throw new ApiError(401, "UNAUTHORIZED", "Ikke autoriseret.");
  }
  return jsonResponse(await new CronController().cleanupAnonymous());
});

// Vercel Cron kalder med GET. Samme beskyttelse (CRON_SECRET) som POST.
export const GET = POST;
