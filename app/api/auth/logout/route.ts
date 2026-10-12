import { noContent, withApi } from "@/middleware/http";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { AuthController } from "@/controllers/authController";

// Logout kræver ikke vilkårs-accept: at afslutte en session må aldrig blokeres af gaten, og routen
// læser ingen data.
export const POST = withApi(async () => {
  const supabase = await createSupabaseServerClient();
  await new AuthController(supabase, null).logout();
  return noContent();
});
