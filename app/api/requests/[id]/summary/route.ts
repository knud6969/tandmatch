import { summarySchema } from "@/lib/schemas/requests";
import { CONSENT_TEXT_VERSIONS } from "@/lib/constants/consents";
import { MAX_IMAGES_PER_REQUEST } from "@/lib/constants/limits";
import type { SummaryResponse } from "@/lib/types/requests";
import { requireTerms } from "@/server/auth/terms";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { ApiError, jsonResponse, parseId, readJson, withApi } from "@/server/http/api";
import { getLatestConsent } from "@/server/models/consents";
import { getConversation, listMessages } from "@/server/models/chat";
import { listImages } from "@/server/models/images";
import {
  approveSummary,
  consumeSummaryGeneration,
  requireOwnRequest,
  storeAiSummary,
} from "@/server/models/requests";
import { downloadImageObject } from "@/server/services/images";
import { createSupabaseAdminClient } from "@/server/db/admin";
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

  // Udkast-grænsen (pr. forespørgsel og pr. døgn) og det globale anonyme loft tjekkes og forbruges atomisk
  // i databasen FØR billeder hentes og AI kaldes. Blokeret kvote tæller derfor ikke.
  const generationsLeft = await consumeSummaryGeneration(supabase, requestId);

  if (images.length > 0) {
    const imageConsent = await getLatestConsent(supabase, "image_upload");
    if (!imageConsent || imageConsent.withdrawnAt !== null || imageConsent.textVersion !== CONSENT_TEXT_VERSIONS.image_upload) {
      throw new ApiError(403, "CONSENT_REQUIRED", "Du skal give samtykke til billeder (nyeste version), før de sendes til AI.");
    }
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

  // Kun et lykkedes udkast gemmes (service role, architecture 2.3). Et fejlet AI-kald må ikke overskrive
  // et tidligere gemt udkast. Godkendelse sker først i PUT.
  if (result.summary !== null) {
    await storeAiSummary(createSupabaseAdminClient(), requestId, result.summary, true);
  }

  const body: SummaryResponse = {
    summary: result.summary,
    retakeImages: result.retakeImages,
    outOfScopeNotice: result.outOfScopeTopics.length > 0,
    fallback: result.fallback,
    generationsLeft,
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
  const summaryApprovedAt = await approveSummary(supabase, requestId, input.summaryText);
  return jsonResponse({
    summaryText: input.summaryText,
    summaryApprovedAt,
  });
});
