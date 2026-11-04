import type { ClinicListItemDto } from "@/lib/clinics/types/clinics";
import type { FavoriteClinicsDto, FavoriteIdsDto } from "@/lib/clinics/types/favorites";
import { apiRequest } from "./client";

// Gemte klinikker (clinics 10.17). Kun patienter med konto; 429 FAVORITE_LIMIT kommer som ApiRequestError med dansk tekst.
export async function getFavoriteIds(): Promise<string[]> {
  return (await apiRequest<FavoriteIdsDto>("/api/favorites/ids")).clinicIds;
}

// De gemte klinikker som oversigtens kort, sorteret efter navn.
export async function getFavorites(): Promise<ClinicListItemDto[]> {
  return (await apiRequest<FavoriteClinicsDto>("/api/favorites")).clinics;
}

export function addFavorite(clinicId: string): Promise<void> {
  return apiRequest(`/api/favorites/${encodeURIComponent(clinicId)}`, { method: "PUT" });
}

export function removeFavorite(clinicId: string): Promise<void> {
  return apiRequest(`/api/favorites/${encodeURIComponent(clinicId)}`, { method: "DELETE" });
}
