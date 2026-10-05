import { createSupabaseServerClient } from "@/server/db/supabase";
import { withApi } from "@/server/http/api";

// Logout kræver ikke vilkårs-accept: at afslutte en session må aldrig blokeres af gaten, og routen
// læser ingen data. Scope "local" logger kun denne enhed ud (default "global" ville logge alle enheder ud).
export const POST = withApi(async () => {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error && error.name !== "AuthSessionMissingError") {
    throw new Error("signOut fejlede");
  }
  return new Response(null, { status: 204 });
});
