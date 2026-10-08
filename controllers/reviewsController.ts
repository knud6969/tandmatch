import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { createReviewSchema, createReplySchema } from "@/lib/schemas/standard";
import type { EligibleVisitDto } from "@/lib/types/standard";
import { requireVerifiedDentist } from "@/models/dentistsModel";
import {
  insertReview,
  insertReviewReply,
  listDentistReviews,
  listEligibleVisits,
  listOwnReviews,
} from "@/models/reviewsModel";

type CreateReviewInput = z.infer<typeof createReviewSchema>;

// Patienten kan kun anmelde et verificeret besøg. Ejerskab og verifikation håndhæves af RLS i insertReview().
export async function submitReview(
  supabase: SupabaseClient,
  patientId: string,
  input: CreateReviewInput,
): Promise<{ id: string; moderationStatus: string }> {
  return insertReview(supabase, patientId, {
    visitId: input.visitId,
    stars: input.stars,
    text: input.text,
    priceAccuracy: input.priceAccuracy,
    actualPrice: input.actualPrice ?? null,
    lackedTransparency: input.lackedTransparency ?? null,
    transparencyComment: input.transparencyComment ?? null,
  });
}

export async function eligibleVisits(supabase: SupabaseClient, patientId: string): Promise<EligibleVisitDto[]> {
  const rows = await listEligibleVisits(supabase, patientId);
  return rows.map((r) => ({
    visitId: r.visitId,
    dentistId: r.dentistId,
    dentistName: r.dentistName,
    clinicName: r.clinicName,
    visitedOn: r.visitedOn,
    quotedPrice: r.quotedPrice,
  }));
}

type CreateReplyInput = z.infer<typeof createReplySchema>;

// Tandlægen svarer offentligt på en godkendt anmeldelse af sig selv. Pending indtil admin godkender.
export async function submitReviewReply(
  supabase: SupabaseClient,
  userId: string,
  reviewId: string,
  input: CreateReplyInput,
): Promise<{ id: string; moderationStatus: string }> {
  await requireVerifiedDentist(supabase, userId);
  return insertReviewReply(supabase, reviewId, userId, input.text);
}

// Patientens egne anmeldelser med moderationsstatus. Kun ejerens (RLS).
export async function ownReviews(supabase: SupabaseClient) {
  const rows = await listOwnReviews(supabase);
  return rows.map((r) => ({
    id: r.id,
    visitId: r.visitId,
    stars: r.stars,
    text: r.text,
    priceAccuracy: r.priceAccuracy,
    actualPrice: r.actualPrice,
    moderationStatus: r.moderationStatus,
    rejectionReason: r.rejectionReason,
    createdAt: r.createdAt,
  }));
}

// Tandlægens egne anmeldelser inkl. pending og status på eget svar. Ingen patientidentitet.
export async function dentistOwnReviews(supabase: SupabaseClient, userId: string) {
  await requireVerifiedDentist(supabase, userId);
  const rows = await listDentistReviews(supabase);
  return rows.map((r) => ({
    reviewId: r.reviewId,
    stars: r.stars,
    text: r.text,
    priceAccuracy: r.priceAccuracy,
    actualPrice: r.actualPrice,
    lackedTransparency: r.lackedTransparency,
    transparencyComment: r.transparencyComment,
    moderationStatus: r.moderationStatus,
    createdAt: r.createdAt,
    reply: r.replyId && r.replyStatus
      ? { id: r.replyId, text: r.replyText ?? "", replyStatus: r.replyStatus }
      : null,
    replyStatus: r.replyStatus ?? "none",
  }));
}
