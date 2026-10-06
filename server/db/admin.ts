import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/server/db/config";

// Service role-klient. Bruges server-side i to tilfælde (architecture 2.3):
// (a) serverens egne skrivninger, som patienter ikke må kunne lave: assistentsvar
//     (append_assistant_message), AI-udkast (store_ai_summary) og det fælles anonyme AI-loft
//     (try_consume_anonymous_ai_call). Hver route har selv tjekket ejerskab og rolle først.
// (b) sletning af auth-brugere og oprydningsjobbet for anonyme sessioner.
// Klienten må aldrig sendes til browseren, og den bruges ikke til almindelige læse-flows.
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
