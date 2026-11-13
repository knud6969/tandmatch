import type { z } from "zod";
import type { emergencyLeadSchema } from "@/lib/leads/schemas/leads";
import type { EmergencyLeadCreatedDto } from "@/lib/leads/types/leads";
import { apiRequest } from "./client";

// Akutvejen (architecture 10.11). ACCOUNT_REQUIRED, CONSENT_REQUIRED m.fl. kommer som ApiRequestError med dansk tekst.

// Opretter sagen og sender den til én klinik i ét kald. Klinikken foreslår en tid, som patienten bekræfter under sagen.
export function sendEmergencyLead(input: z.infer<typeof emergencyLeadSchema>): Promise<EmergencyLeadCreatedDto> {
  return apiRequest<EmergencyLeadCreatedDto>("/api/emergency-leads", { method: "POST", json: input });
}
