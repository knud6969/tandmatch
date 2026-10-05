import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConsentType } from "@/lib/types/common";

export type NewConsent = {
  patientId: string;
  type: ConsentType;
  textVersion: string;
  grantedWhileAnonymous: boolean;
};

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

// Aktivt samtykke jf. has_active_consent() i databasen (seneste række uden tilbagetrækning).
export async function hasActiveConsent(supabase: SupabaseClient, type: ConsentType): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_active_consent", { p_type: type });
  if (error) {
    throw new Error("has_active_consent fejlede");
  }
  return data === true;
}
