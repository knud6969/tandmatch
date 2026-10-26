import "server-only";
import type { ClinicRecordDto } from "@/lib/clinics/types/clinics";
import type { ClinicsRepository } from "@/features/clinics/clinicsRepository";
import { createGeocodingService } from "@/features/clinics/geocoding";
import type { GeocodingService } from "@/features/clinics/geocodingService";

// Klinikkens placering ud fra adressen (clinics 4.3). Kaldes efter oprettelse (identity, signup) og efter ændret adresse
// eller postnummer (ClinicsController.patch), når rækken allerede har postnummerets midtpunkt. Et fund gemmes med
// klinikkens egen session (set_clinic_location, RLS). Kaster aldrig: uden fund eller ved fejl er klinikken uændret.
export class ClinicLocationService {
  constructor(
    private readonly clinics: ClinicsRepository,
    private readonly geocoding: GeocodingService = createGeocodingService(),
  ) {}

  // Returnerer klinikken med den placering, den har bagefter.
  async locate(clinic: ClinicRecordDto): Promise<ClinicRecordDto> {
    const found = await this.geocoding.locate(
      { address: clinic.address, postalCode: clinic.postalCode, city: clinic.city },
      clinic.location,
    );
    if (!found) return clinic;
    try {
      await this.clinics.setOwnLocation(found);
    } catch (error) {
      console.warn(`Placeringen kunne ikke gemmes (${error instanceof Error ? error.name : "ukendt fejl"}).`);
      return clinic;
    }
    return { ...clinic, location: found };
  }
}
