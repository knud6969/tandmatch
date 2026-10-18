import { ApiError, jsonResponse, withApi } from "@/middleware/http";
import { isValidCronRequest } from "@/middleware/cron";
import { CronController } from "@/controllers/cronController";

// Skriver den effektive bookingstatus ned: gennemførte tider bliver `completed`, udløbne reservationer `cancelled`
// (architecture 5.3, 10.10). Beskyttet med CRON_SECRET i Authorization-headeren og undtaget fra vilkårs-gaten (2.5).
// Ingen persondata i svar eller logs.
export const POST = withApi(async (req) => {
  if (!isValidCronRequest(req.headers.get("authorization"))) {
    throw new ApiError(401, "UNAUTHORIZED", "Ikke autoriseret.");
  }
  return jsonResponse(await new CronController().completeBookings());
});

// Vercel Cron kalder med GET. Samme beskyttelse (CRON_SECRET) som POST.
export const GET = POST;
