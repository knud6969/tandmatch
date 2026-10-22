import { refreshSchema } from "@/lib/schemas/auth";
import { ApiError, NO_STORE, jsonResponse, readJson, withApi } from "@/platform/middleware/http";
import { enforceIpRateLimit } from "@/platform/middleware/rateLimit";
import { createSupabaseStatelessClient, isMobileClient } from "@/platform/db/supabase";
import { AuthController } from "@/controllers/authController";

const REFRESH_LIMIT_PER_HOUR = 60;

// Fornyer appens tokens (architecture 10.2). Undtaget fra vilkårs-gaten: kalderen har allerede et login, og routen læser
// ingen data. Kun for appen. Refresh-tokenet sendes kun i bodyen. Klienten har ingen cookies og ingen Authorization
// (et udløbet adgangstoken må ikke blive sendt videre).
export const POST = withApi(async (req) => {
  if (!isMobileClient(req)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Fornyelse er kun for appen.");
  }
  await enforceIpRateLimit("auth-refresh", req, REFRESH_LIMIT_PER_HOUR);
  const input = await readJson(req, refreshSchema);
  const session = await new AuthController(createSupabaseStatelessClient(), null).refresh(input.refreshToken);
  return jsonResponse({ session }, 200, NO_STORE);
});
