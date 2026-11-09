import "server-only";
import type { SlotDto } from "@/lib/clinics/types/clinics";
import { ApiError } from "@/platform/middleware/http";
import type { AvailabilityRepository } from "@/features/clinics/availabilityRepository";
import type { AvailabilityService } from "@/features/clinics/availabilityService";
import type { ClinicDirectoryRepository } from "@/features/clinics/clinicDirectoryRepository";
import type { ServicesRepository } from "@/features/clinics/servicesRepository";

export type ClinicSlotsDeps = {
  directory: ClinicDirectoryRepository;
  availability: AvailabilityRepository;
  services: ServicesRepository;
  slots: AvailabilityService;
};

// Ledige tider hos en verificeret klinik for én behandling (architecture 6.7). Fælles for klinikoversigten og booking, så
// beregningen findes ét sted. Den, der kalder, bestemmer, hvilken fejl en ikke-verificeret klinik giver (404 eller 409).
export class ClinicSlotsService {
  constructor(private readonly deps: ClinicSlotsDeps) {}

  async slotsFor(
    clinicId: string,
    serviceId: string,
    range: { from?: string; to?: string },
    unavailable: () => ApiError,
  ): Promise<{ slots: SlotDto[] }> {
    const { directory, availability, services, slots } = this.deps;
    const [service] = await services.requireActive([serviceId]);
    const clinic = await directory.findClinic(clinicId, [service.id]);
    if (!clinic || clinic.tier !== "full") throw unavailable();
    const resolved = slots.resolveRange(range.from, range.to);
    if (!resolved.ok) throw new ApiError(400, "VALIDATION_ERROR", resolved.message);
    const { from, to } = resolved;
    const busy = (await availability.listBusyIntervals([clinicId], from, to)).get(clinicId) ?? [];
    return {
      slots: slots.slots({
        openingHours: clinic.openingHours,
        busy,
        durationMin: slots.durationFor(clinic.prices, [service]),
        isEmergency: service.category === "emergency",
        from,
        to,
      }),
    };
  }
}
