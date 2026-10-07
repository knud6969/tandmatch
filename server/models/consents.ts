import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConsentDto } from "@/lib/types/requests";
import type { ConsentType } from "@/lib/types/common";
import { ApiError, notFound } from "@/server/http/api";
import { mapDbError } from "@/server/http/db-errors";

export type NewConsent = {
  patientId: string;
  type: ConsentType;
  textVersion: string;
  grantedWhileAnonymous: boolean;
};

const CONSENT_COLUMNS = "id, type, text_version, granted_at, granted_while_anonymous, withdrawn_at";

type ConsentRow = {
  id: string;
  type: ConsentType;
  text_version: string;
  granted_at: string;
  granted_while_anonymous: boolean;
  withdrawn_at: string | null;
};

function toDto(row: ConsentRow): ConsentDto {
  return {
    id: row.id,
    type: row.type,
    textVersion: row.text_version,
    grantedAt: row.granted_at,
    grantedWhileAnonymous: row.granted_while_anonymous,
    withdrawnAt: row.withdrawn_at,
  };
}

// Flere samtykker indsættes i ét insert, så de enten alle gemmes eller ingen.
export async function insertConsents(supabase: SupabaseClient, rows: NewConsent[]): Promise<void> {
  const { error } = await supabase.from("consents").insert(
    rows.map((row) => ({
      patient_id: row.patientId,
      type: row.type,
      text_version: row.textVersion,
      granted_while_anonymous: row.grantedWhileAnonymous,
    })),
  );
  if (error) {
    throw new Error("consents: insert fejlede");
  }
}

export async function insertConsent(
  supabase: SupabaseClient,
  row: NewConsent,
): Promise<ConsentDto> {
  const { data, error } = await supabase
    .from("consents")
    .insert({
      patient_id: row.patientId,
      type: row.type,
      text_version: row.textVersion,
      granted_while_anonymous: row.grantedWhileAnonymous,
    })
    .select(CONSENT_COLUMNS)
    .single();
  if (error || !data) throw new Error("consents: insert fejlede");
  return toDto(data as unknown as ConsentRow);
}

export async function listConsents(supabase: SupabaseClient): Promise<ConsentDto[]> {
  const { data, error } = await supabase
    .from("consents")
    .select(CONSENT_COLUMNS)
    .order("granted_at", { ascending: false });
  if (error) throw new Error("consents: list fejlede");
  return (data as unknown as ConsentRow[]).map(toDto);
}

// Seneste række af en type (samme regel som has_active_consent i databasen).
export async function getLatestConsent(
  supabase: SupabaseClient,
  type: ConsentType,
): Promise<ConsentDto | null> {
  const { data, error } = await supabase
    .from("consents")
    .select(CONSENT_COLUMNS)
    .eq("type", type)
    .order("granted_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("consents: select fejlede");
  return data ? toDto(data as unknown as ConsentRow) : null;
}

// Aktivt samtykke: seneste række uden tilbagetrækning. Samme regel som has_active_consent() i databasen.
export async function hasActiveConsent(supabase: SupabaseClient, type: ConsentType): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_active_consent", { p_type: type });
  if (error) {
    throw new Error("has_active_consent fejlede");
  }
  return data === true;
}

export type WithdrawConsentResult = {
  withdrawnAt: string;
  consentType: ConsentType;
  deletedImagePaths: string[];
  closedConversations: number;
};

// Al logik ligger i withdraw_consent() (security definer): sætter withdrawn_at, sletter billedrækker
// (image_upload) og lukker aktive AI-samtaler (ai_processing). Returnerer filstierne, så API'et kan
// rydde storage i samme kald (architecture 5.3).
export async function withdrawConsent(
  supabase: SupabaseClient,
  consentId: string,
): Promise<WithdrawConsentResult> {
  const { data, error } = await supabase.rpc("withdraw_consent", { p_consent_id: consentId });
  mapDbError(
    error,
    {
      NOT_FOUND: notFound(),
      ALREADY_WITHDRAWN: new ApiError(409, "ALREADY_WITHDRAWN", "Samtykket er allerede trukket tilbage."),
      UNAUTHENTICATED: new ApiError(401, "UNAUTHENTICATED", "Du skal være logget ind."),
    },
    "withdraw_consent fejlede",
  );
  const row = (data as unknown as Array<{
    withdrawn_at: string;
    consent_type: ConsentType;
    deleted_image_paths: string[] | null;
    closed_conversations: number;
  }> | null)?.[0];
  if (!row) throw new Error("withdraw_consent: uventet svar");
  return {
    withdrawnAt: row.withdrawn_at,
    consentType: row.consent_type,
    deletedImagePaths: row.deleted_image_paths ?? [],
    closedConversations: row.closed_conversations,
  };
}

// Bekræfter at oprydningen efter tilbagetrækning er udført (kun image_upload: filerne er fjernet fra storage).
export async function confirmConsentCleanup(supabase: SupabaseClient, consentId: string): Promise<void> {
  const { error } = await supabase.rpc("confirm_consent_cleanup", { p_consent_id: consentId });
  if (error) throw new Error("confirm_consent_cleanup fejlede");
}
