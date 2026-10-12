import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/models/db/config";

// Service role-klient (architecture 2.3, 2.1.1). Må kun bruges til de formål, 2.3 opregner: (a) AI-skrivninger,
// (b) det anonyme AI-loft og rate limit, (c) billedfiler og case_images-rækker, (d) public-media efter ejertjek,
// (e) signering af URL'er til case-images, (f) sletning af auth-brugere, (g) planlagte jobs og (h) seed- og admin-scripts.
// Aldrig til at læse data på brugerens vegne. Klienten må aldrig sendes til browseren.
//
// Må kun kaldes herfra (via lazyAdminClient) og fra scripts/. Controllere og services kalder den aldrig direkte.
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

// Getter, der opretter service role-klienten ved første kald og genbruger den derefter. En controller gemmer
// getteren i `admin`-feltet, så klienten kun oprettes, hvis requesten faktisk har brug for den (og tests ikke
// behøver nøglen). En ny getter pr. controller-instans betyder, at klienten kun lever inden for én request.
export function lazyAdminClient(): () => SupabaseClient {
  let client: SupabaseClient | null = null;
  return () => (client ??= createSupabaseAdminClient());
}
