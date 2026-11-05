import { ApiError, jsonResponse, withApi } from "@/platform/middleware/http";
import { isValidCronRequest } from "@/platform/middleware/cron";
import { CronController } from "@/platform/cronController";

// Opbevaring og filoprydning (security M3 og M4): sletter beskedbilleder 12 måneder efter sidste aktivitet i tråden og tømmer køen af
// filer, der skal slettes (pending_storage_paths). Beskyttet med CRON_SECRET i Authorization-headeren og undtaget fra vilkårs-gaten
// (2.5). Ingen persondata i svar eller logs. Kaldes hver time.
export const POST = withApi(async (req) => {
  if (!isValidCronRequest(req.headers.get("authorization"))) {
    throw new ApiError(401, "UNAUTHORIZED", "Ikke autoriseret.");
  }
  return jsonResponse(await new CronController().cleanupStorage());
});

// Vercel Cron kalder med GET. Samme beskyttelse (CRON_SECRET) som POST.
export const GET = POST;
