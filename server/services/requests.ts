import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestDraftDto } from "@/lib/types/requests";
import { listImages } from "@/server/models/images";
import { getConversation } from "@/server/models/chat";
import { countSentResponses } from "@/server/models/responses";
import { signedImageUrl } from "@/server/services/images";
import type { RequestRecord } from "@/server/models/requests";

// Samler forespørgslen til DTO for patienten. Billeder får friske signerede URL'er ved hver visning.
export async function buildDraftDto(supabase: SupabaseClient, record: RequestRecord): Promise<RequestDraftDto> {
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
