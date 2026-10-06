import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CosmeticCategory, RequestStatus } from "@/lib/types/common";
import type { InboxRecipientStatus } from "@/lib/types/dentist";

// Indbakken for tandlægen: forespørgsler der er sendt til tandlægen via request_recipients (architecture 10.6).
// Patientens navn, e-mail og patients-række hentes aldrig her (architecture 4.4).

type InboxFunctionRow = {
  request_id: string;
  category: CosmeticCategory;
  postal_code: string | null;
  distance_km: number | string;
  recipient_status: InboxRecipientStatus;
  request_status: RequestStatus;
  sent_at: string | null;
  expires_at: string | null;
  image_count: number | string;
};

export type InboxRecord = {
  requestId: string;
  category: CosmeticCategory;
  postalCode: string | null;
  distanceKm: number;
  imageCount: number;
  recipientStatus: InboxRecipientStatus;
  requestStatus: RequestStatus;
  sentAt: string;
  expiresAt: string;
};

export async function listInboxRows(
  supabase: SupabaseClient,
  status: InboxRecipientStatus | undefined,
): Promise<InboxRecord[]> {
  // Funktionen returnerer kun de felter tandlægen må se (ingen patient_id, ingen ai_summary).
  const { data, error } = await supabase.rpc("dentist_inbox", { p_status: status ?? null });
  if (error) throw new Error("dentist_inbox fejlede");

  return ((data ?? []) as unknown as InboxFunctionRow[]).map((row) => ({
    requestId: row.request_id,
    category: row.category,
    postalCode: row.postal_code,
    distanceKm: Number(row.distance_km),
    imageCount: Number(row.image_count),
    recipientStatus: row.recipient_status,
    requestStatus: row.request_status,
    sentAt: row.sent_at ?? "",
    expiresAt: row.expires_at ?? "",
  }));
}

// Byer til postnumrene i indbakken. Postnummer er offentlige opslagsdata (postal_codes).
export async function cityByPostalCode(
  supabase: SupabaseClient,
  postalCodes: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(postalCodes)];
  const cities = new Map<string, string>();
  if (unique.length === 0) return cities;
  const { data, error } = await supabase
    .from("postal_codes")
    .select("postal_code, city")
    .in("postal_code", unique);
  if (error) throw new Error("postal_codes: select fejlede");
  for (const row of data ?? []) {
    cities.set(row.postal_code as string, row.city as string);
  }
  return cities;
}

export type InboxDetailRecord = {
  requestId: string;
  category: CosmeticCategory;
  postalCode: string | null;
  city: string | null;
  requestStatus: RequestStatus;
  sentAt: string | null;
  expiresAt: string | null;
  summaryText: string | null;
  answers: Record<string, string | string[]>;
  distanceKm: number;
};

export type SharedImageRecord = {
  id: string;
  storagePath: string;
  view: string | null;
  quality: string | null;
};

// Læser via dentist_request_detail(). Ingen rækker betyder: ikke modtager, kladde eller findes ikke (samme svar).
export async function getInboxDetailRow(
  supabase: SupabaseClient,
  requestId: string,
): Promise<InboxDetailRecord | null> {
  const { data, error } = await supabase.rpc("dentist_request_detail", { p_request_id: requestId });
  if (error) throw new Error("dentist_request_detail fejlede");
  const row = (data as unknown as Array<{
    request_id: string;
    category: CosmeticCategory;
    postal_code: string | null;
    city: string | null;
    request_status: RequestStatus;
    sent_at: string | null;
    expires_at: string | null;
    summary_text: string | null;
    answers: Record<string, string | string[]> | null;
    distance_km: number | string;
  }> | null)?.[0];
  if (!row) return null;
  return {
    requestId: row.request_id,
    category: row.category,
    postalCode: row.postal_code,
    city: row.city,
    requestStatus: row.request_status,
    sentAt: row.sent_at,
    expiresAt: row.expires_at,
    summaryText: row.summary_text,
    answers: row.answers ?? {},
    distanceKm: Number(row.distance_km),
  };
}

// Billeder med aktivt samtykke til deling, via dentist_request_images().
export async function listSharedImageRows(
  supabase: SupabaseClient,
  requestId: string,
): Promise<SharedImageRecord[]> {
  const { data, error } = await supabase.rpc("dentist_request_images", { p_request_id: requestId });
  if (error) throw new Error("dentist_request_images fejlede");
  return ((data ?? []) as unknown as Array<{
    image_id: string;
    storage_path: string;
    ai_view: string | null;
    ai_quality: string | null;
  }>).map((row) => ({
    id: row.image_id,
    storagePath: row.storage_path,
    view: row.ai_view,
    quality: row.ai_quality,
  }));
}

export type RecipientRequestStatus = { status: RequestStatus; expiresAt: string | null };

// Status for en forespørgsel tandlægen er modtager af (dentist_request_status). Ingen rækker: ikke modtager, kladde eller findes ikke.
export async function getRecipientRequestStatus(
  supabase: SupabaseClient,
  requestId: string,
): Promise<RecipientRequestStatus | null> {
  const { data, error } = await supabase.rpc("dentist_request_status", { p_request_id: requestId });
  if (error) throw new Error("dentist_request_status fejlede");
  const row = (data as unknown as Array<{ request_status: RequestStatus; expires_at: string | null }> | null)?.[0];
  if (!row) return null;
  return { status: row.request_status, expiresAt: row.expires_at };
}
