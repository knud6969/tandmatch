import { noContent, withApi } from "@/middleware/http";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { logout } from "@/controllers/authController";

// Logout kræver ikke vilkårs-accept: at afslutte en session må aldrig blokeres af gaten, og routen
// læser ingen data.
export const POST = withApi(async () => {
  const supabase = await createSupabaseServerClient();
  await logout(supabase);
  return noContent();
});
