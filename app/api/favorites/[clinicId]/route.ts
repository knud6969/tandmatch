import { FavoritesController } from "@/features/clinics/favoritesController";
import { favoriteClinicParamsSchema } from "@/lib/clinics/schemas/favorites";
import { ACCOUNT_REQUIRED_MESSAGES, noContent, parseParams, withApi } from "@/platform/middleware/http";
import { requireAccount, requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

type Ctx = { params: Promise<{ clinicId: string }> };

// Gem en klinik (clinics 10.17). 204, også hvis den allerede er gemt. 404 for en klinik, der ikke vises offentligt; 429 FAVORITE_LIMIT.
export const PUT = withApi<Ctx>(async (_req, { params }) => {
  const gate = await requireTerms();
  const session = requireAccount(await requireRole("patient", { allowAnonymous: true, ctx: gate }), ACCOUNT_REQUIRED_MESSAGES.favorites);
  const { clinicId } = parseParams(favoriteClinicParamsSchema, await params);
  await new FavoritesController(gate.supabase, session).add(clinicId);
  return noContent();
});

// Fjern en gemt klinik. 204, også hvis den ikke var gemt.
export const DELETE = withApi<Ctx>(async (_req, { params }) => {
  const gate = await requireTerms();
  const session = requireAccount(await requireRole("patient", { allowAnonymous: true, ctx: gate }), ACCOUNT_REQUIRED_MESSAGES.favorites);
  const { clinicId } = parseParams(favoriteClinicParamsSchema, await params);
  await new FavoritesController(gate.supabase, session).remove(clinicId);
  return noContent();
});
