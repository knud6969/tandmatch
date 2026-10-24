import type { ClinicListDto, ClinicProfileDto } from "@/lib/clinics/types/clinics";
import type { PublicReviewsDto } from "@/lib/booking/types/reviews";
import { apiRequest } from "./client";

// `query` bygges af buildClinicsQuery() i ~/utils/clinic-filters (samme nøgler som architecture 10.7).
export function listClinics(query: string): Promise<ClinicListDto> {
  return apiRequest<ClinicListDto>(`/api/clinics${query ? `?${query}` : ""}`);
}

// Med `serviceSlugs` udfyldes priceForSelection (prisen for sagens behandlinger).
export function getClinic(clinicId: string, serviceSlugs: string[] = []): Promise<ClinicProfileDto> {
  const query = serviceSlugs.length > 0 ? `?services=${encodeURIComponent(serviceSlugs.join(","))}` : "";
  return apiRequest<ClinicProfileDto>(`/api/clinics/${encodeURIComponent(clinicId)}${query}`);
}

export function getClinicReviews(clinicId: string): Promise<PublicReviewsDto> {
  return apiRequest<PublicReviewsDto>(`/api/clinics/${encodeURIComponent(clinicId)}/reviews`);
}
