import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PriceRange } from "@/lib/types/common";
import type { PriceAccuracy } from "@/lib/types/standard";
import { ApiError } from "@/server/http/api";

// Skrivninger og patientens egne læsninger af anmeldelser, besøg og svar. Al adgang styres af RLS.

export type NewReview = {
  visitId: string;
  stars: number;
  text: string;
  priceAccuracy: PriceAccuracy;
  actualPrice: number | null;
  lackedTransparency: boolean | null;
  transparencyComment: string | null;
};

// Fejl oversættes via PostgREST-koden (SQLSTATE), ikke via beskedtekst.
export async function insertReview(
  supabase: SupabaseClient,
  patientId: string,
  input: NewReview,
): Promise<{ id: string; moderationStatus: string }> {
  const { data, error } = await supabase
    .from("reviews")
    .insert({
      visit_id: input.visitId,
      patient_id: patientId,
      stars: input.stars,
      text: input.text,
      price_accuracy: input.priceAccuracy,
      actual_price: input.actualPrice,
      lacked_transparency: input.lackedTransparency,
      transparency_comment: input.transparencyComment,
    })
    .select("id, moderation_status")
    .single();
  if (error) {
    if (error.code === "42501") throw new ApiError(403, "NO_VERIFIED_VISIT", "Du kan kun anmelde et verificeret besøg.");
    if (error.code === "23505") throw new ApiError(409, "ALREADY_REVIEWED", "Du har allerede anmeldt dette besøg.");
    if (error.code === "23514") throw new ApiError(400, "INVALID_REVIEW", "Anmeldelsen er ikke gyldig. Tjek felterne.");
    throw new Error("reviews: insert fejlede");
  }
  if (!data) throw new Error("reviews: insert uden række");
  return { id: data.id as string, moderationStatus: data.moderation_status as string };
}

export type EligibleVisitRow = {
  visitId: string;
  dentistId: string;
  dentistName: string | null;
  clinicName: string | null;
  visitedOn: string;
  quotedPrice: PriceRange | null;
};

// Verificerede besøg uden anmeldelse. Besøg med anmeldelse filtreres fra her.
export async function listEligibleVisits(supabase: SupabaseClient, patientId: string): Promise<EligibleVisitRow[]> {
  const { data, error } = await supabase
    .from("visits")
    .select("id, dentist_id, visited_on, dentists(full_name, clinics(name)), responses(price_min, price_max)")
    .eq("patient_id", patientId)
    .not("verified_at", "is", null)
    .order("visited_on", { ascending: false });
  if (error) throw new Error("visits: select fejlede");

  const { data: reviewed, error: reviewedError } = await supabase.from("reviews").select("visit_id").eq("patient_id", patientId);
  if (reviewedError) throw new Error("reviews: select fejlede");
  const reviewedIds = new Set((reviewed ?? []).map((row) => row.visit_id as string));

  type Embed<T> = T | T[] | null;
  const first = <T,>(value: Embed<T>): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);
  return (
    (data ?? []) as unknown as {
      id: string;
      dentist_id: string;
      visited_on: string;
      dentists: Embed<{ full_name: string; clinics: Embed<{ name: string }> }>;
      responses: Embed<{ price_min: number; price_max: number }>;
    }[]
  )
    .filter((row) => !reviewedIds.has(row.id))
    .map((row) => {
      const dentist = first(row.dentists);
      const clinic = dentist ? first(dentist.clinics) : null;
      const quoted = first(row.responses);
      return {
        visitId: row.id,
        dentistId: row.dentist_id,
        dentistName: dentist?.full_name ?? null,
        clinicName: clinic?.name ?? null,
        visitedOn: row.visited_on,
        quotedPrice: quoted ? { min: quoted.price_min, max: quoted.price_max } : null,
      };
    });
}

// Svar på en anmeldelse. Kun den anmeldte tandlæge (RLS og trigger). Pending indtil admin godkender.
export async function insertReviewReply(
  supabase: SupabaseClient,
  reviewId: string,
  dentistId: string,
  text: string,
): Promise<{ id: string; moderationStatus: string }> {
  const { data, error } = await supabase
    .from("review_replies")
    .insert({ review_id: reviewId, dentist_id: dentistId, text })
    .select("id, moderation_status")
    .single();
  if (error) {
    if (error.code === "42501") throw new ApiError(403, "NOT_ELIGIBLE", "Du kan kun svare på godkendte anmeldelser af dig.");
    if (error.code === "23505") throw new ApiError(409, "ALREADY_REPLIED", "Anmeldelsen har allerede et svar.");
    if (error.code === "23514") throw new ApiError(400, "INVALID_REPLY", "Svaret er ikke gyldigt.");
    throw new Error("review_replies: insert fejlede");
  }
  if (!data) throw new Error("review_replies: insert uden række");
  return { id: data.id as string, moderationStatus: data.moderation_status as string };
}

export type OwnReviewRow = {
  id: string;
  visitId: string;
  stars: number;
  text: string;
  priceAccuracy: PriceAccuracy;
  actualPrice: number | null;
  moderationStatus: "pending" | "approved" | "rejected";
  rejectionReason: string | null;
  createdAt: string;
};

// Patientens egne anmeldelser. RLS (reviews_select_own) begrænser til patient_id = uid.
export async function listOwnReviews(supabase: SupabaseClient): Promise<OwnReviewRow[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select("id, visit_id, stars, text, price_accuracy, actual_price, moderation_status, rejection_reason, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("reviews: select fejlede");
  return (data ?? []).map((row) => ({
    id: row.id as string,
    visitId: row.visit_id as string,
    stars: row.stars as number,
    text: row.text as string,
    priceAccuracy: row.price_accuracy as PriceAccuracy,
    actualPrice: (row.actual_price as number | null) ?? null,
    moderationStatus: row.moderation_status as OwnReviewRow["moderationStatus"],
    rejectionReason: (row.rejection_reason as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}

export type DentistReviewRow = {
  reviewId: string;
  stars: number;
  text: string;
  priceAccuracy: PriceAccuracy;
  actualPrice: number | null;
  lackedTransparency: boolean | null;
  transparencyComment: string | null;
  moderationStatus: "pending" | "approved" | "rejected";
  createdAt: string;
  replyId: string | null;
  replyText: string | null;
  replyStatus: "pending" | "approved" | "rejected" | null;
};

// Tandlægens egne anmeldelser (dentist_reviews). Ingen patient-id.
export async function listDentistReviews(supabase: SupabaseClient): Promise<DentistReviewRow[]> {
  const { data, error } = await supabase.rpc("dentist_reviews");
  if (error) throw new Error("dentist_reviews fejlede");
  return ((data ?? []) as unknown as Array<{
    review_id: string;
    stars: number;
    text: string;
    price_accuracy: PriceAccuracy;
    actual_price: number | null;
    lacked_transparency: boolean | null;
    transparency_comment: string | null;
    moderation_status: DentistReviewRow["moderationStatus"];
    created_at: string;
    reply_id: string | null;
    reply_text: string | null;
    reply_status: DentistReviewRow["replyStatus"];
  }>).map((row) => ({
    reviewId: row.review_id,
    stars: row.stars,
    text: row.text,
    priceAccuracy: row.price_accuracy,
    actualPrice: row.actual_price,
    lackedTransparency: row.lacked_transparency,
    transparencyComment: row.transparency_comment,
    moderationStatus: row.moderation_status,
    createdAt: row.created_at,
    replyId: row.reply_id,
    replyText: row.reply_text,
    replyStatus: row.reply_status,
  }));
}

