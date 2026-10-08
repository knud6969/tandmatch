import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PatientRecord = { firstName: string | null; postalCode: string | null };

export async function getPatient(supabase: SupabaseClient, userId: string): Promise<PatientRecord | null> {
  const { data, error } = await supabase
    .from("patients")
    .select("first_name, postal_code")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error("patients: select fejlede");
  if (!data) return null;
  return {
    firstName: (data.first_name as string | null) ?? null,
    postalCode: (data.postal_code as string | null) ?? null,
  };
}

export async function updatePatient(
  supabase: SupabaseClient,
  userId: string,
  patch: { first_name?: string; postal_code?: string },
): Promise<void> {
  const { error } = await supabase.from("patients").update(patch).eq("id", userId);
  if (error) {
    throw new Error("patients: update fejlede");
  }
}

export async function updateFirstName(
  supabase: SupabaseClient,
  userId: string,
  firstName: string,
): Promise<void> {
  await updatePatient(supabase, userId, { first_name: firstName });
}
