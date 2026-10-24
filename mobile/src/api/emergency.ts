import type { z } from "zod";
import type { emergencyLeadSchema } from "@/lib/leads/schemas/leads";
import type { EmergencyLeadCreatedDto } from "@/lib/leads/types/leads";
import type { SlotDto } from "@/lib/clinics/types/clinics";
import { apiRequest } from "./client";

// Akutvejen (architecture 10.11). SLOT_TAKEN, SLOT_UNAVAILABLE, ACCOUNT_REQUIRED, CONSENT_REQUIRED m.fl. kommer som ApiRequestError med dansk tekst.

// Ledige tider hos en klinik for en akutbehandling (uden from/to: de næste 14 dage).
export async function getClinicAvailability(clinicId: string, serviceId: string): Promise<SlotDto[]> {
  const result = await apiRequest<{ slots: SlotDto[] }>(
    `/api/clinics/${encodeURIComponent(clinicId)}/availability?serviceId=${encodeURIComponent(serviceId)}`,
  );
  return result.slots;
}

// Opretter sagen, sender den til én klinik og reserverer tiden i ét kald.
export function sendEmergencyLead(input: z.infer<typeof emergencyLeadSchema>): Promise<EmergencyLeadCreatedDto> {
  return apiRequest<EmergencyLeadCreatedDto>("/api/emergency-leads", { method: "POST", json: input });
}
