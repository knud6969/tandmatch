import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function updateFirstName(
  supabase: SupabaseClient,
  userId: string,
  firstName: string,
): Promise<void> {
  const { error } = await supabase
    .from("patients")
    .update({ first_name: firstName })
    .eq("id", userId);
  if (error) {
    throw new Error("patients: update fejlede");
  }
}
