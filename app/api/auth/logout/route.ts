import { noContent, withApi } from "@/platform/middleware/http";
import { createSupabaseRequestClient } from "@/platform/db/supabase";
import { AuthController } from "@/features/identity/authController";

// Logout kræver ikke vilkårs-accept: at afslutte en session må aldrig blokeres af gaten, og routen
// læser ingen data. Med bearer tilbagekaldes tokenets session (refresh-tokenet bliver ugyldigt); cookies røres ikke.
export const POST = withApi(async () => {
  const { supabase, transport, accessToken } = await createSupabaseRequestClient();
  await new AuthController(supabase, null).logout(transport === "bearer" ? (accessToken ?? "") : null);
  return noContent();
});
