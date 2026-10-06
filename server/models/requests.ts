import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CosmeticCategory, RequestStatus } from "@/lib/types/common";
import type { AiSummary } from "@/lib/types/ai";
import { ApiError, notFound } from "@/server/http/api";
import { mapDbError } from "@/server/http/db-errors";

const COLUMNS =
  "id, patient_id, category, answers, questions_version, free_text, postal_code, max_distance_km, summary_text, summary_ai_assisted, summary_approved_at, ai_summary, sharing_consent_id, status, sent_at, expires_at, created_at";

type RequestRow = {
  id: string;
  patient_id: string;
  category: CosmeticCategory;
  answers: Record<string, string | string[]>;
  questions_version: string;
  free_text: string | null;
  postal_code: string | null;
  max_distance_km: number;
  summary_text: string | null;
  summary_ai_assisted: boolean;
  summary_approved_at: string | null;
  ai_summary: AiSummary | null;
  sharing_consent_id: string | null;
  status: RequestStatus;
  sent_at: string | null;
  expires_at: string | null;
  created_at: string;
};

// Camel-case-form til services og routes. Kolonnenavne forlader aldrig models/.
export type RequestRecord = {
  id: string;
  patientId: string;
  category: CosmeticCategory;
  answers: Record<string, string | string[]>;
  questionsVersion: string;
  freeText: string | null;
  postalCode: string | null;
  maxDistanceKm: number;
  summaryText: string | null;
  summaryAiAssisted: boolean;
  summaryApprovedAt: string | null;
  aiSummary: AiSummary | null;
  status: RequestStatus;
  sentAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

function toRecord(row: RequestRow): RequestRecord {
  return {
    id: row.id,
    patientId: row.patient_id,
    category: row.category,
    answers: row.answers ?? {},
    questionsVersion: row.questions_version,
    freeText: row.free_text,
    postalCode: row.postal_code,
    maxDistanceKm: row.max_distance_km,
    summaryText: row.summary_text,
    summaryAiAssisted: row.summary_ai_assisted,
    summaryApprovedAt: row.summary_approved_at,
    aiSummary: row.ai_summary ?? null,
    status: row.status,
    sentAt: row.sent_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export async function findDraftId(supabase: SupabaseClient, patientId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("requests")
    .select("id")
    .eq("patient_id", patientId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("requests: select fejlede");
  return (data?.id as string | undefined) ?? null;
}

export async function insertDraft(
  supabase: SupabaseClient,
  params: { patientId: string; category: CosmeticCategory; questionsVersion: string },
): Promise<string> {
  const { data, error } = await supabase
    .from("requests")
    .insert({
      patient_id: params.patientId,
      category: params.category,
      questions_version: params.questionsVersion,
    })
    .select("id")
    .single();
  mapDbError(error, { ANON_DRAFT_LIMIT: new ApiError(409, "DRAFT_EXISTS", "Du har allerede en kladde.") }, "requests: insert fejlede");
  if (!data) throw new Error("requests: insert fejlede");
  return data.id as string;
}

export async function listOwnRequests(supabase: SupabaseClient): Promise<RequestRecord[]> {
  const { data, error } = await supabase
    .from("requests")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("requests: list fejlede");
  return (data as unknown as RequestRow[]).map(toRecord);
}

// RLS begrænser synligheden. Ingen rækker betyder enten "findes ikke" eller "ikke din". Begge giver 404.
export async function getRequest(supabase: SupabaseClient, id: string): Promise<RequestRecord | null> {
  const { data, error } = await supabase.from("requests").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error("requests: select fejlede");
  return data ? toRecord(data as unknown as RequestRow) : null;
}

// Ejerskab tjekkes eksplicit i tillæg til RLS. Ikke-ejere får 404.
export async function requireOwnRequest(
  supabase: SupabaseClient,
  id: string,
  userId: string,
): Promise<RequestRecord> {
  const record = await getRequest(supabase, id);
  if (!record || record.patientId !== userId) {
    throw notFound();
  }
  return record;
}

export async function updateDraft(
  supabase: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
): Promise<RequestRecord> {
  const { data, error } = await supabase
    .from("requests")
    .update(patch)
    .eq("id", id)
    .eq("status", "draft")
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error("requests: update fejlede");
  if (!data) {
    throw new ApiError(409, "NOT_DRAFT", "Forespørgslen er ikke længere en kladde og kan ikke ændres.");
  }
  return toRecord(data as unknown as RequestRow);
}

export async function deleteDraft(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("requests").delete().eq("id", id).eq("status", "draft");
  if (error) throw new Error("requests: delete fejlede");
}

// Tæller et udkast atomisk i databasen. Returnerer udkast tilbage på forespørgslen.
export async function consumeSummaryGeneration(supabase: SupabaseClient, id: string): Promise<number> {
  const { data, error } = await supabase.rpc("consume_summary_generation", { p_request_id: id });
  mapDbError(
    error,
    {
      SUMMARY_LIMIT: new ApiError(429, "SUMMARY_LIMIT", "Du har brugt alle udkast til denne forespørgsel."),
      ANON_CAP_REACHED: new ApiError(429, "ANON_CAP_REACHED", "Chatten er travl lige nu. Opret en konto eller prøv igen senere."),
      DAILY_SUMMARY_LIMIT: new ApiError(429, "DAILY_SUMMARY_LIMIT", "Du har brugt dagens udkast. Prøv igen i morgen."),
      NOT_DRAFT: new ApiError(409, "NOT_DRAFT", "Forespørgslen er sendt. Opsummeringen kan ikke ændres."),
      NOT_FOUND: notFound(),
    },
    "consume_summary_generation fejlede",
  );
  if (typeof data !== "number") throw new Error("consume_summary_generation: uventet svar");
  return data;
}

// Godkendelse af opsummering. Ændrer kun kladder (approve_summary i databasen).
export async function approveSummary(supabase: SupabaseClient, id: string, summaryText: string): Promise<string> {
  const { data, error } = await supabase.rpc("approve_summary", { p_request_id: id, p_summary_text: summaryText });
  mapDbError(
    error,
    {
      NOT_FOUND: notFound(),
      NOT_DRAFT: new ApiError(409, "NOT_DRAFT", "Forespørgslen er sendt og kan ikke ændres."),
    },
    "approve_summary fejlede",
  );
  if (typeof data !== "string") throw new Error("approve_summary: uventet svar");
  return data;
}

// Gemmer AI-udkast på kladden (store_ai_summary i databasen).
export async function storeAiSummary(
  supabase: SupabaseClient,
  id: string,
  summary: unknown,
  aiAssisted: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("store_ai_summary", {
    p_request_id: id,
    p_summary: summary,
    p_ai_assisted: aiAssisted,
  });
  mapDbError(error, { NOT_FOUND: notFound(), NOT_DRAFT: new ApiError(409, "NOT_DRAFT", "Forespørgslen er sendt.") }, "store_ai_summary fejlede");
}

// Afsendelse sker kun via send_request() (security definer). Fejlkoder fra funktionen oversættes her.
export async function sendRequest(supabase: SupabaseClient, id: string): Promise<number> {
  const { data, error } = await supabase.rpc("send_request", { p_request_id: id });
  mapDbError(
    error,
    {
      NO_MATCHES: new ApiError(409, "NO_MATCHES", "Ingen tandlæger matcher forespørgslen endnu. Prøv en større afstand."),
      CONSENT_REQUIRED: new ApiError(403, "CONSENT_REQUIRED", "Du skal give samtykke til deling, før forespørgslen sendes."),
      SUMMARY_NOT_APPROVED: new ApiError(409, "SUMMARY_NOT_APPROVED", "Godkend opsummeringen, før forespørgslen sendes."),
      POSTAL_CODE_REQUIRED: new ApiError(400, "POSTAL_CODE_REQUIRED", "Angiv dit postnummer, før forespørgslen sendes."),
      NOT_DRAFT: new ApiError(409, "NOT_DRAFT", "Forespørgslen er allerede sendt."),
      ACCOUNT_REQUIRED: new ApiError(403, "ACCOUNT_REQUIRED", "Opret en konto for at sende forespørgslen."),
      NOT_FOUND: notFound(),
    },
    "send_request fejlede",
  );
  if (typeof data !== "number") throw new Error("send_request: uventet svar");
  return data;
}
