import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConsentDto } from "@/lib/types/requests";
import type { ConsentType } from "@/lib/types/common";

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
