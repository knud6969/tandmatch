import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CosmeticCategory } from "@/lib/types/common";
import { CLINIC_COLUMNS, toClinicRecord, type ClinicRecord, type ClinicRow } from "@/server/models/clinics";

// Dataadgang for tandlægens egen række (architecture 4.3). Kolonnenavne forlader ikke denne fil.

const DENTIST_COLUMNS = `id, clinic_id, full_name, title, bio, photo_path, authorization_id, is_verified, is_active, accepts_cosmetic, cosmetic_categories, next_available_at, next_available_updated_at, clinics(${CLINIC_COLUMNS})`;

type DentistRow = {
  id: string;
  clinic_id: string | null;
  full_name: string;
  title: string | null;
  bio: string | null;
  photo_path: string | null;
  authorization_id: string;
  is_verified: boolean;
  is_active: boolean;
  accepts_cosmetic: boolean;
  cosmetic_categories: CosmeticCategory[];
  next_available_at: string | null;
  next_available_updated_at: string | null;
  clinics: ClinicRow | null;
};

export type DentistRecord = {
  id: string;
  clinicId: string | null;
  fullName: string;
  title: string | null;
  bio: string | null;
  photoPath: string | null;
  authorizationId: string;
  isVerified: boolean;
  isActive: boolean;
  acceptsCosmetic: boolean;
  cosmeticCategories: CosmeticCategory[];
  nextAvailableAt: string | null;
  nextAvailableUpdatedAt: string | null;
  clinic: ClinicRecord | null;
};

function toDentistRecord(row: DentistRow): DentistRecord {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    fullName: row.full_name,
    title: row.title,
    bio: row.bio,
    photoPath: row.photo_path,
    authorizationId: row.authorization_id,
    isVerified: row.is_verified,
    isActive: row.is_active,
    acceptsCosmetic: row.accepts_cosmetic,
    cosmeticCategories: row.cosmetic_categories ?? [],
    nextAvailableAt: row.next_available_at,
    nextAvailableUpdatedAt: row.next_available_updated_at,
    clinic: row.clinics ? toClinicRecord(row.clinics) : null,
  };
}

export async function getOwnDentist(supabase: SupabaseClient, userId: string): Promise<DentistRecord | null> {
  const { data, error } = await supabase
    .from("dentists")
    .select(DENTIST_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error("dentists: select fejlede");
  return data ? toDentistRecord(data as unknown as DentistRow) : null;
}

// Feltnavne er allerede i snake_case. RLS og dentists_guard afviser felter, tandlægen ikke må ændre.
export async function updateOwnDentist(
  supabase: SupabaseClient,
  userId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("dentists").update(patch).eq("id", userId);
  if (error) throw new Error("dentists: update fejlede");
}
