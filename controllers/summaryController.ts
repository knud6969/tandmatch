import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONSENT_TEXT_VERSIONS } from "@/lib/constants/consents";
import { MAX_IMAGES_PER_REQUEST } from "@/lib/constants/limits";
import type { SummaryResponse } from "@/lib/types/requests";
import { ApiError } from "@/middleware/http";
import type { Session } from "@/middleware/session";
import { createSupabaseAdminClient } from "@/models/db/admin";
import { getLatestConsent } from "@/models/consentsModel";
import { getConversation, listMessages } from "@/models/chatModel";
import { downloadImageObject, listImages } from "@/models/imagesModel";
import {
  approveSummary,
  consumeSummaryGeneration,
  requireOwnRequest,
  storeAiSummary,
} from "@/models/requestsModel";
import { generateSummary } from "@/services/ai/summary";

// Udkast fra AI (architecture 10.4). Patienten godkender altid bagefter, før tandlæger kan se den.
// Fejler AI to gange, returneres fallback "write_yourself", og patienten skriver selv.
export async function generateSummaryDraft(
  supabase: SupabaseClient,
  session: Session,
  requestId: string,
): Promise<SummaryResponse> {
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
  // et tidligere gemt udkast. Godkendelse sker først i approveSummaryText.
  if (result.summary !== null) {
    await storeAiSummary(createSupabaseAdminClient(), requestId, result.summary, true);
  }

  return {
    summary: result.summary,
    retakeImages: result.retakeImages,
    outOfScopeNotice: result.outOfScopeTopics.length > 0,
    fallback: result.fallback,
    generationsLeft,
  };
}

// Patienten godkender opsummeringen. Det er den tandlæger ser, og den er påkrævet før afsendelse.
export async function approveSummaryText(
  supabase: SupabaseClient,
  session: Session,
  requestId: string,
  summaryText: string,
): Promise<{ summaryText: string; summaryApprovedAt: string }> {
  await requireOwnRequest(supabase, requestId, session.userId);
  const summaryApprovedAt = await approveSummary(supabase, requestId, summaryText);
  return { summaryText, summaryApprovedAt };
}
