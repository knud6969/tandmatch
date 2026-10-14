import { clinicsQuerySchema } from "@/lib/schemas/clinics";
import { jsonResponse, readQuery, withApi } from "@/middleware/http";
import { getSession } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { ClinicDirectoryController } from "@/controllers/clinicDirectoryController";

const QUERY_KEYS = ["services", "postalCode", "lat", "lng", "maxDistanceKm", "maxPrice", "minStars", "emergency", "contactableOnly", "sort"];

// Offentlig klinikoversigt (architecture 10.7). lat/lng gemmes ikke.
export const GET = withApi(async (req) => {
  const gate = await requireTerms();
  const query = readQuery(req, clinicsQuerySchema, QUERY_KEYS);
  const session = await getSession(gate);
  return jsonResponse(await new ClinicDirectoryController(gate.supabase, session).list(query));
});
