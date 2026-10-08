import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { QUESTIONS_VERSION } from "@/lib/constants/questions";
import type { z } from "zod";
import type { patchRequestSchema } from "@/lib/schemas/requests";
import type { RequestDraftDto, RequestListItemDto, SentRequestDto } from "@/lib/types/requests";
import type { CosmeticCategory } from "@/lib/types/common";
import { getConversation } from "@/models/chatModel";
import { countSentResponses } from "@/models/responsesModel";
import { listImages, removeImageObject, signedImageUrl } from "@/models/imagesModel";
import { createSupabaseAdminClient } from "@/models/db/admin";
import {
  deleteDraft,
  getRequest,
  insertDraft,
  listOwnRequests,
  requireOwnRequest,
  sendRequest,
  updateDraft,
  type RequestRecord,
} from "@/models/requestsModel";
import { ApiError } from "@/middleware/http";
import type { Session } from "@/middleware/session";

// Samler forespørgslen til DTO for patienten. Billeder får friske signerede URL'er ved hver visning.
async function buildDraftDto(supabase: SupabaseClient, record: RequestRecord): Promise<RequestDraftDto> {
  const images = await listImages(supabase, record.id);
  const imageDtos = [];
  for (const image of images) {
    const url = await signedImageUrl(supabase, image.storagePath);
    if (url) {
      imageDtos.push({ id: image.id, url, view: image.view, quality: image.quality });
    }
  }
  const conversation = await getConversation(supabase, record.id);

  return {
    id: record.id,
    status: record.status,
    category: record.category,
    answers: record.answers,
    questionsVersion: record.questionsVersion,
    freeText: record.freeText,
    postalCode: record.postalCode,
    maxDistanceKm: record.maxDistanceKm,
    images: imageDtos,
    hasConversation: conversation !== null,
    aiSummary: record.aiSummary,
    summaryText: record.summaryText,
    summaryApprovedAt: record.summaryApprovedAt,
    sentAt: record.sentAt,
    expiresAt: record.expiresAt,
    responseCount: (await countSentResponses(supabase, [record.id])).get(record.id) ?? 0,
  };
}

// Én egen forespørgsel som kladde-DTO. Bruges af wizarden, også for anonyme patienter.
export async function getOwnDraft(
  supabase: SupabaseClient,
  session: Session,
  requestId: string,
): Promise<RequestDraftDto> {
  const record = await requireOwnRequest(supabase, requestId, session.userId);
  return buildDraftDto(supabase, record);
}

export async function listOwnRequestsDto(supabase: SupabaseClient): Promise<RequestListItemDto[]> {
  const records = await listOwnRequests(supabase);
  const counts = await countSentResponses(
    supabase,
    records.map((r) => r.id),
  );
  return records.map((r) => ({
    id: r.id,
    category: r.category,
    status: r.status,
    sentAt: r.sentAt,
    expiresAt: r.expiresAt,
    responseCount: counts.get(r.id) ?? 0,
    unreadMessages: 0, // beskeder kommer i trin 6
  }));
}

export async function createDraftRequest(
  supabase: SupabaseClient,
  patientId: string,
  category: CosmeticCategory,
): Promise<RequestDraftDto> {
  const id = await insertDraft(supabase, { patientId, category, questionsVersion: QUESTIONS_VERSION });
  const record = await getRequest(supabase, id);
  if (!record) {
    throw new Error("forespørgsel ikke fundet efter oprettelse");
  }
  return buildDraftDto(supabase, record);
}

type PatchDraftInput = z.infer<typeof patchRequestSchema>;

// Kun kladder kan redigeres. freeText kræver konto (architecture 10.4).
export async function patchDraftRequest(
  supabase: SupabaseClient,
  session: Session,
  requestId: string,
  input: PatchDraftInput,
): Promise<RequestDraftDto> {
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
  return buildDraftDto(supabase, record);
}

// Sletter kladden, inkl. billedfiler i storage. Rækker slettes via cascade.
export async function deleteDraftRequest(
  supabase: SupabaseClient,
  session: Session,
  requestId: string,
): Promise<void> {
  const record = await requireOwnRequest(supabase, requestId, session.userId);
  if (record.status !== "draft") {
    throw new ApiError(409, "NOT_DRAFT", "Kun kladder kan slettes.");
  }
  const admin = createSupabaseAdminClient();
  for (const image of await listImages(supabase, requestId)) {
    await removeImageObject(admin, image.storagePath);
  }
  await deleteDraft(supabase, requestId);
}

// Afsendelse kræver permanent konto (architecture 6.2, 10.4); det tjekker routen. Selve reglerne ligger i send_request().
export async function sendDraftRequest(
  supabase: SupabaseClient,
  session: Session,
  requestId: string,
): Promise<SentRequestDto> {
  await requireOwnRequest(supabase, requestId, session.userId);
  const recipientCount = await sendRequest(supabase, requestId);
  const sent = await getRequest(supabase, requestId);
  return { status: "sent", recipientCount, expiresAt: sent?.expiresAt ?? null };
}
