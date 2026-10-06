import { patchRequestSchema } from "@/lib/schemas/requests";
import { requireTerms } from "@/server/auth/terms";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { ApiError, jsonResponse, parseId, readJson, withApi } from "@/server/http/api";
import { deleteDraft, requireOwnRequest, updateDraft } from "@/server/models/requests";
import { listImages } from "@/server/models/images";
import { buildDraftDto } from "@/server/services/requests";
import { removeImageObject } from "@/server/services/images";
import { createSupabaseAdminClient } from "@/server/db/admin";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi(async (_req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  const requestId = parseId((await ctx.params).id);
  const supabase = await createSupabaseServerClient();
  const record = await requireOwnRequest(supabase, requestId, session.userId);
  return jsonResponse(await buildDraftDto(supabase, record));
});

// Kun kladder kan redigeres. freeText kræver konto (architecture 10.4).
export const PATCH = withApi(async (req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  const requestId = parseId((await ctx.params).id);
  const input = await readJson(req, patchRequestSchema);
  const supabase = await createSupabaseServerClient();
  const current = await requireOwnRequest(supabase, requestId, session.userId);
  if (current.status !== "draft") {
    throw new ApiError(409, "NOT_DRAFT", "Forespørgslen er sendt og kan ikke ændres.");
  }
  if (input.freeText && session.isAnonymous) {
    throw new ApiError(403, "ACCOUNT_REQUIRED", "Opret en konto for at skrive fri tekst.");
  }

  const patch: Record<string, unknown> = {};
  if (input.category !== undefined) patch.category = input.category;
  if (input.answers !== undefined) patch.answers = input.answers;
  if (input.freeText !== undefined) patch.free_text = input.freeText;
  if (input.postalCode !== undefined) patch.postal_code = input.postalCode;
  if (input.maxDistanceKm !== undefined) patch.max_distance_km = input.maxDistanceKm;

  const record =
    Object.keys(patch).length === 0 ? current : await updateDraft(supabase, requestId, patch);
  return jsonResponse(await buildDraftDto(supabase, record));
});

// Sletter kladden, inkl. billedfiler i storage. Rækker slettes via cascade.
export const DELETE = withApi(async (_req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  const requestId = parseId((await ctx.params).id);
  const supabase = await createSupabaseServerClient();
  const record = await requireOwnRequest(supabase, requestId, session.userId);
  if (record.status !== "draft") {
    throw new ApiError(409, "NOT_DRAFT", "Kun kladder kan slettes.");
  }
  for (const image of await listImages(supabase, requestId)) {
    await removeImageObject(createSupabaseAdminClient(), image.storagePath);
  }
  await deleteDraft(supabase, requestId);
  return new Response(null, { status: 204 });
});
