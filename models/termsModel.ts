import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/constants/legal";
import type { TermsPayload } from "@/middleware/termsCookie";

// Skriver accept til terms_acceptances via brugerens JWT (RLS: user_id = auth.uid()).
// Dubletter ignoreres, så samme version kun findes én gang pr. bruger.
export async function upsertTermsAcceptance(
  supabase: SupabaseClient,
  userId: string,
  payload: TermsPayload,
): Promise<void> {
  const { error } = await supabase.from("terms_acceptances").upsert(
    {
      user_id: userId,
      terms_version: payload.termsVersion,
      privacy_version: payload.privacyVersion,
      accepted_at: payload.acceptedAt,
    },
    {
      onConflict: "user_id,terms_version,privacy_version",
      ignoreDuplicates: true,
    },
  );
  if (error) {
    throw new Error("terms_acceptances: upsert fejlede");
  }
}

export async function hasCurrentTermsAcceptance(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("terms_acceptances")
    .select("id")
    .eq("user_id", userId)
    .eq("terms_version", TERMS_VERSION)
    .eq("privacy_version", PRIVACY_VERSION)
    .maybeSingle();
  if (error) {
    throw new Error("terms_acceptances: select fejlede");
  }
  return data !== null;
}
