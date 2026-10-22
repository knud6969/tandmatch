import { clinicsQuerySchema } from "@/lib/clinics/schemas/clinics";
import { jsonResponse, readQuery, withApi } from "@/platform/middleware/http";
import { getSession } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";
import { ClinicDirectoryController } from "@/features/clinics/clinicDirectoryController";

const QUERY_KEYS = ["ids", "services", "postalCode", "lat", "lng", "maxDistanceKm", "maxPrice", "minStars", "emergency", "contactableOnly", "onlyOffering", "sort"];

// Offentlig klinikoversigt (architecture 10.7). lat/lng gemmes ikke.
export const GET = withApi(async (req) => {
  const gate = await requireTerms();
  const query = readQuery(req, clinicsQuerySchema, QUERY_KEYS);
  const session = await getSession(gate);
  return jsonResponse(await new ClinicDirectoryController(gate.supabase, session).list(query));
});
