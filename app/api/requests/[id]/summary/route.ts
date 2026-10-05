import { summarySchema } from "@/lib/schemas/requests";
import { MAX_IMAGES_PER_REQUEST } from "@/lib/constants/limits";
import type { SummaryResponse } from "@/lib/types/requests";
import { requireTerms } from "@/server/auth/terms";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { ApiError, jsonResponse, parseId, readJson, withApi } from "@/server/http/api";
import { getLatestConsent } from "@/server/models/consents";
import { getConversation, listMessages, tryConsumeAnonymousAiCall } from "@/server/models/chat";
import { listImages } from "@/server/models/images";
import { requireOwnRequest, updateDraft } from "@/server/models/requests";
import { downloadImageObject } from "@/server/services/images";
import { anonymousDailyCap } from "@/server/ai/chat";
import { generateSummary } from "@/server/ai/summary";

type Ctx = { params: Promise<{ id: string }> };

// Udkast fra AI (architecture 10.4). Patienten godkender altid bagefter via PUT, før tandlæger kan se den.
// Fejler AI to gange, returneres fallback "write_yourself", og patienten skriver selv.
export const POST = withApi(async (_req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  const requestId = parseId((await ctx.params).id);
  const supabase = await createSupabaseServerClient();

  const record = await requireOwnRequest(supabase, requestId, session.userId);
  if (record.status !== "draft") {
    throw new ApiError(409, "NOT_DRAFT", "Forespørgslen er sendt. Opsummeringen kan ikke ændres.");
  }

  const aiConsent = await getLatestConsent(supabase, "ai_processing");
  if (!aiConsent || aiConsent.withdrawnAt !== null) {
    throw new ApiError(403, "CONSENT_REQUIRED", "Du skal give samtykke til AI-behandling, før vi kan lave et udkast.");
  }

  if (session.isAnonymous && !(await tryConsumeAnonymousAiCall(supabase, anonymousDailyCap()))) {
    throw new ApiError(429, "ANON_CAP_REACHED", "Chatten er travl lige nu. Opret en konto eller prøv igen senere.");
  }

  const conversation = await getConversation(supabase, requestId);
  const messages = conversation ? await listMessages(supabase, conversation.id) : [];
  const images = await listImages(supabase, requestId);
  if (images.length > MAX_IMAGES_PER_REQUEST) {
    throw new ApiError(400, "IMAGE_LIMIT", "Du kan højst bruge 5 billeder pr. forespørgsel.");
  }

  const hasPatientInput =
    Object.keys(record.answers).length > 0 ||
    Boolean(record.freeText) ||
    messages.some((m) => m.role === "user") ||
    images.length > 0;
  if (!hasPatientInput) {
    throw new ApiError(400, "NOTHING_TO_SUMMARIZE", "Svar på spørgsmålene, skriv en besked eller vedlæg et billede først.");
  }

  const imageBytes = [];
  for (const image of images) {
    imageBytes.push({ imageId: image.id, bytes: await downloadImageObject(supabase, image.storagePath) });
  }

  const result = await generateSummary({
    category: record.category,
    answers: record.answers,
    freeText: record.freeText,
    history: messages.map((m) => ({ role: m.role, content: m.content })),
    images: imageBytes,
  });

  // Udkastet gemmes, så det kan vises igen. Godkendelse sker først i PUT.
  await updateDraft(supabase, requestId, {
    ai_summary: result.summary,
    summary_ai_assisted: result.summary !== null,
  });

  const body: SummaryResponse = {
    summary: result.summary,
    retakeImages: result.retakeImages,
    outOfScopeNotice: result.outOfScopeTopics.length > 0,
    fallback: result.fallback,
  };
  return jsonResponse(body);
});

// Patienten godkender opsummeringen. Det er den tandlæger ser, og den er påkrævet før afsendelse.
export const PUT = withApi(async (req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  const requestId = parseId((await ctx.params).id);
  const input = await readJson(req, summarySchema);
  const supabase = await createSupabaseServerClient();
  await requireOwnRequest(supabase, requestId, session.userId);
  const record = await updateDraft(supabase, requestId, {
    summary_text: input.summaryText,
    summary_approved_at: new Date().toISOString(),
  });
  return jsonResponse({
    summaryText: record.summaryText,
    summaryApprovedAt: record.summaryApprovedAt,
  });
});
