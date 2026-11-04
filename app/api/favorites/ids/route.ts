import { FavoritesController } from "@/features/clinics/favoritesController";
import { ACCOUNT_REQUIRED_MESSAGES, jsonResponse, withApi } from "@/platform/middleware/http";
import { requireAccount, requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

// Id'er på gemte klinikker, der stadig vises offentligt (clinics 10.17). Bruges til hjertet i listen og på profilen.
export const GET = withApi(async () => {
  const gate = await requireTerms();
  const session = requireAccount(await requireRole("patient", { allowAnonymous: true, ctx: gate }), ACCOUNT_REQUIRED_MESSAGES.favorites);
  return jsonResponse(await new FavoritesController(gate.supabase, session).ids());
});
