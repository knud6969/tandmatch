import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/server/db/config";

// Service role-klient. Må KUN bruges til: sletning af auth-brugere ved konto-/sessionssletning,
// oprydningsjobbet for anonyme sessioner (architecture 2.3). Aldrig i almindelige request-flows.
export function createSupabaseAdminClient(): SupabaseClient {
  const { url } = getSupabaseConfig();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY mangler");
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
