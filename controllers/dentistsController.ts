import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { patchClinicSchema, patchDentistSchema } from "@/lib/schemas/dentists";
import type { ClinicDto, DentistMeDto } from "@/lib/types/dentists";
import { ApiError, notFound } from "@/middleware/http";
import { requireOwnDentist, updateOwnDentist, type DentistRecord } from "@/models/dentistsModel";
import {
  findPostalCode,
  getClinic,
  insertClinic,
  linkDentistToClinic,
  updateClinic,
  type ClinicRecord,
} from "@/models/clinicsModel";

type PatchDentistInput = z.infer<typeof patchDentistSchema>;
type PatchClinicInput = z.infer<typeof patchClinicSchema>;

export function toClinicDto(clinic: ClinicRecord): ClinicDto {
  return {
    id: clinic.id,
    name: clinic.name,
    address: clinic.address,
    postalCode: clinic.postalCode,
    city: clinic.city,
    phone: clinic.phone,
    website: clinic.website,
    trustpilot: {
      url: clinic.trustpilotUrl,
      score: clinic.trustpilotScore,
      reviewCount: clinic.trustpilotReviewCount,
      updatedAt: clinic.trustpilotUpdatedAt,
    },
  };
}

function toDentistMeDto(dentist: DentistRecord): DentistMeDto {
  return {
    id: dentist.id,
    fullName: dentist.fullName,
    title: dentist.title,
    bio: dentist.bio,
    photoUrl: null,
    isActive: dentist.isActive,
    acceptsCosmetic: dentist.acceptsCosmetic,
    cosmeticCategories: dentist.cosmeticCategories,
    nextAvailableAt: dentist.nextAvailableAt,
    nextAvailableUpdatedAt: dentist.nextAvailableUpdatedAt,
    isVerified: dentist.isVerified,
    authorizationId: dentist.authorizationId,
    clinic: dentist.clinic ? toClinicDto(dentist.clinic) : null,
  };
}

export async function getMyDentist(supabase: SupabaseClient, userId: string): Promise<DentistMeDto> {
  return toDentistMeDto(await requireOwnDentist(supabase, userId));
}

// Autorisations-ID kan ikke ændres her (kun admin, architecture 4.3). Det håndhæves også af dentists_guard.
export async function updateMyDentist(
  supabase: SupabaseClient,
  userId: string,
  input: PatchDentistInput,
): Promise<DentistMeDto> {
  await requireOwnDentist(supabase, userId);
  const patch: Record<string, unknown> = {};
  if (input.fullName !== undefined) patch.full_name = input.fullName;
  if (input.title !== undefined) patch.title = input.title || null;
  if (input.bio !== undefined) patch.bio = input.bio || null;
  if (input.isActive !== undefined) patch.is_active = input.isActive;
  if (input.acceptsCosmetic !== undefined) patch.accepts_cosmetic = input.acceptsCosmetic;
  if (input.cosmeticCategories !== undefined) patch.cosmetic_categories = input.cosmeticCategories;
  if (input.nextAvailableAt !== undefined) {
    // Tidspunktet for sidste opdatering vises, så ældre oplysninger kan markeres som "ikke opdateret".
    patch.next_available_at = input.nextAvailableAt;
    patch.next_available_updated_at = new Date().toISOString();
  }
  if (Object.keys(patch).length > 0) {
    await updateOwnDentist(supabase, userId, patch);
  }
  return getMyDentist(supabase, userId);
}

function clinicFieldPatch(input: PatchClinicInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.address !== undefined) patch.address = input.address;
  if (input.phone !== undefined) patch.phone = input.phone || null;
  if (input.website !== undefined) patch.website = input.website || null;
  if (input.trustpilotUrl !== undefined) patch.trustpilot_url = input.trustpilotUrl || null;
  if (input.trustpilotScore !== undefined) patch.trustpilot_score = input.trustpilotScore;
  if (input.trustpilotReviewCount !== undefined) patch.trustpilot_review_count = input.trustpilotReviewCount;
  return patch;
}

const TRUSTPILOT_KEYS = ["trustpilotUrl", "trustpilotScore", "trustpilotReviewCount"] as const;

// Opretter klinikken første gang (created_by = tandlægen) eller opdaterer tandlægens egen klinik.
// Postnummeret skal findes i postal_codes, så klinikken kan indgå i matching og afstand.
export async function updateMyClinic(
  supabase: SupabaseClient,
  userId: string,
  input: PatchClinicInput,
): Promise<ClinicDto> {
  const dentist = await requireOwnDentist(supabase, userId);

  if (!dentist.clinic) {
    const missing = (["name", "address", "postalCode", "city"] as const).filter((key) => !input[key]);
    if (missing.length > 0) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Udfyld navn, adresse, postnummer og by for at oprette klinikken.",
      );
    }
    const geo = await findPostalCode(supabase, input.postalCode!);
    if (!geo) {
      throw new ApiError(400, "POSTAL_CODE_UNKNOWN", "Postnummeret findes ikke i postnummerlisten.");
    }
    const clinic = await insertClinic(supabase, userId, {
      name: input.name!,
      address: input.address!,
      postalCode: input.postalCode!,
      city: input.city!,
      lat: geo.lat,
      lng: geo.lng,
      phone: input.phone || null,
      website: input.website || null,
    });
    await linkDentistToClinic(supabase, userId, clinic.id);

    const trustpilotPatch = clinicFieldPatch(input);
    if (TRUSTPILOT_KEYS.some((key) => input[key] !== undefined)) {
      const updated = await updateClinic(supabase, clinic.id, {
        trustpilot_url: trustpilotPatch.trustpilot_url,
        trustpilot_score: trustpilotPatch.trustpilot_score,
        trustpilot_review_count: trustpilotPatch.trustpilot_review_count,
      });
      return toClinicDto(updated ?? clinic);
    }
    return toClinicDto(clinic);
  }

  const patch = clinicFieldPatch(input);
  if (input.postalCode !== undefined) {
    const geo = await findPostalCode(supabase, input.postalCode);
    if (!geo) {
      throw new ApiError(400, "POSTAL_CODE_UNKNOWN", "Postnummeret findes ikke i postnummerlisten.");
    }
    patch.postal_code = input.postalCode;
    patch.lat = geo.lat;
    patch.lng = geo.lng;
    if (input.city === undefined) patch.city = geo.city;
  }
  if (input.city !== undefined) patch.city = input.city;

  if (Object.keys(patch).length === 0) {
    const current = await getClinic(supabase, dentist.clinic.id);
    if (!current) throw notFound();
    return toClinicDto(current);
  }

  const updated = await updateClinic(supabase, dentist.clinic.id, patch);
  if (!updated) throw notFound();
  return toClinicDto(updated);
}
