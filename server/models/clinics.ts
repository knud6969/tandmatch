import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Dataadgang for klinikker og postnummer-opslag (architecture 4.3). Kolonnenavne forlader ikke denne fil.

export const CLINIC_COLUMNS =
  "id, name, address, postal_code, city, phone, website, trustpilot_url, trustpilot_score, trustpilot_review_count, trustpilot_updated_at";

export type ClinicRow = {
  id: string;
  name: string;
  address: string;
  postal_code: string;
  city: string;
  phone: string | null;
  website: string | null;
  trustpilot_url: string | null;
  trustpilot_score: number | string | null;
  trustpilot_review_count: number | null;
  trustpilot_updated_at: string | null;
};

export type ClinicRecord = {
  id: string;
  name: string;
  address: string;
  postalCode: string;
  city: string;
  phone: string | null;
  website: string | null;
  trustpilotUrl: string | null;
  trustpilotScore: number | null;
  trustpilotReviewCount: number | null;
  trustpilotUpdatedAt: string | null;
};

export function toClinicRecord(row: ClinicRow): ClinicRecord {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    postalCode: row.postal_code,
    city: row.city,
    phone: row.phone,
    website: row.website,
    trustpilotUrl: row.trustpilot_url,
    trustpilotScore: row.trustpilot_score === null ? null : Number(row.trustpilot_score),
    trustpilotReviewCount: row.trustpilot_review_count,
    trustpilotUpdatedAt: row.trustpilot_updated_at,
  };
}

export async function findPostalCode(
  supabase: SupabaseClient,
  postalCode: string,
): Promise<{ city: string; lat: number; lng: number } | null> {
  const { data, error } = await supabase
    .from("postal_codes")
    .select("city, lat, lng")
    .eq("postal_code", postalCode)
    .maybeSingle();
  if (error) throw new Error("postal_codes: select fejlede");
  if (!data) return null;
  return { city: data.city as string, lat: Number(data.lat), lng: Number(data.lng) };
}

export async function getClinic(supabase: SupabaseClient, clinicId: string): Promise<ClinicRecord | null> {
  const { data, error } = await supabase
    .from("clinics")
    .select(CLINIC_COLUMNS)
    .eq("id", clinicId)
    .maybeSingle();
  if (error) throw new Error("clinics: select fejlede");
  return data ? toClinicRecord(data as unknown as ClinicRow) : null;
}

// Klinikken oprettes med created_by = uid. RLS (clinics_insert_dentist) afviser alt andet.
export async function insertClinic(
  supabase: SupabaseClient,
  userId: string,
  values: {
    name: string;
    address: string;
    postalCode: string;
    city: string;
    lat: number;
    lng: number;
    phone: string | null;
    website: string | null;
  },
): Promise<ClinicRecord> {
  const { data, error } = await supabase
    .from("clinics")
    .insert({
      created_by: userId,
      name: values.name,
      address: values.address,
      postal_code: values.postalCode,
      city: values.city,
      lat: values.lat,
      lng: values.lng,
      phone: values.phone,
      website: values.website,
    })
    .select(CLINIC_COLUMNS)
    .single();
  if (error || !data) throw new Error("clinics: insert fejlede");
  return toClinicRecord(data as unknown as ClinicRow);
}

// Returnerer null, hvis RLS ikke tillader opdateringen (ingen rækker).
export async function updateClinic(
  supabase: SupabaseClient,
  clinicId: string,
  patch: Record<string, unknown>,
): Promise<ClinicRecord | null> {
  const { data, error } = await supabase
    .from("clinics")
    .update(patch)
    .eq("id", clinicId)
    .select(CLINIC_COLUMNS)
    .maybeSingle();
  if (error) throw new Error("clinics: update fejlede");
  return data ? toClinicRecord(data as unknown as ClinicRow) : null;
}

// Knytter tandlægen til sin nyoprettede klinik. dentists_guard kræver, at klinikken har created_by = uid.
export async function linkDentistToClinic(
  supabase: SupabaseClient,
  userId: string,
  clinicId: string,
): Promise<void> {
  const { error } = await supabase
    .from("dentists")
    .update({ clinic_id: clinicId })
    .eq("id", userId);
  if (error) throw new Error("dentists: klinik-link fejlede");
}
