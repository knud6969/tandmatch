import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PatientExportDto } from "@/lib/types/export";
import { listOwnRequests } from "@/server/models/requests";
import { listOwnResponses } from "@/server/models/responses";
import { listOwnReviews } from "@/server/models/reviews";
import { listConsents } from "@/server/models/consents";

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
