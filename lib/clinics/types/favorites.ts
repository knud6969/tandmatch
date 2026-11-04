import type { ClinicListItemDto } from "@/lib/clinics/types/clinics";

// Gemte klinikker (clinics 10.17). Kun klinikker, der stadig vises offentligt.
export type FavoriteIdsDto = { clinicIds: string[] };
export type FavoriteClinicsDto = { clinics: ClinicListItemDto[] }; // samme kort som oversigten (10.7), sorteret efter navn

// Dataeksport (identity 10.2): patientens egne favoritter.
export type FavoriteExportDto = { clinicId: string; createdAt: string };
