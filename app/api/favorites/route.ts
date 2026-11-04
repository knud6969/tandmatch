import { FavoritesController } from "@/features/clinics/favoritesController";
import { ACCOUNT_REQUIRED_MESSAGES, jsonResponse, withApi } from "@/platform/middleware/http";
import { requireAccount, requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

// Patientens gemte klinikker som oversigtens kort (clinics 10.17). Kun patienter med konto.
export const GET = withApi(async () => {
  const gate = await requireTerms();
  const session = requireAccount(await requireRole("patient", { allowAnonymous: true, ctx: gate }), ACCOUNT_REQUIRED_MESSAGES.favorites);
  return jsonResponse(await new FavoritesController(gate.supabase, session).list());
});
