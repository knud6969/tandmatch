import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConsentDto } from "@/lib/types/consents";
import { listOwnRequests, type RequestRecord } from "@/models/requestsModel";
import { listOwnResponses, type ResponseRecord } from "@/models/responsesModel";
import { listOwnReviews, type OwnReviewRow } from "@/models/reviewsModel";
import { listConsents } from "@/models/consentsModel";

// Dataeksport for egen konto (GDPR art. 15/20). Kun egne data; RLS afgør hvad der kan læses.
// Eksporten indeholder bevidst de fulde rækker, så den hentes som fil og ikke vises i UI'et.
type PatientExportDto = {
  exportedAt: string;
  requests: RequestRecord[];
  responses: ResponseRecord[];
  reviews: OwnReviewRow[];
  consents: ConsentDto[];
};

// Samler egne forespørgsler, svar, anmeldelser og samtykker. Hver model læser kun egne rækker (RLS).
export async function exportOwnData(supabase: SupabaseClient): Promise<PatientExportDto> {
  const [requests, responses, reviews, consents] = await Promise.all([
    listOwnRequests(supabase),
    listOwnResponses(supabase),
    listOwnReviews(supabase),
    listConsents(supabase),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    requests,
    responses,
    reviews,
    consents,
  };
}
