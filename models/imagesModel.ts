import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/middleware/http";
import { mapDbError } from "@/models/db/errors";
import { REQUEST_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/lib/constants/limits";

export type ImageRecord = {
  id: string;
  requestId: string;
  storagePath: string;
  view: string | null;
  quality: string | null;
  width: number;
  height: number;
  bytes: number;
};

type ImageRow = {
  id: string;
  request_id: string;
  storage_path: string;
  ai_view: string | null;
  ai_quality: string | null;
  width: number;
  height: number;
  bytes: number;
};

function toRecord(row: ImageRow): ImageRecord {
  return {
    id: row.id,
    requestId: row.request_id,
    storagePath: row.storage_path,
    view: row.ai_view,
    quality: row.ai_quality,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
  };
}

const COLUMNS = "id, request_id, storage_path, ai_view, ai_quality, width, height, bytes";

export async function listImages(supabase: SupabaseClient, requestId: string): Promise<ImageRecord[]> {
  const { data, error } = await supabase
    .from("request_images")
    .select(COLUMNS)
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });
  if (error) throw new Error("request_images: list fejlede");
  return (data as unknown as ImageRow[]).map(toRecord);
}

export async function sumImageBytes(supabase: SupabaseClient, patientId: string): Promise<number> {
  const { data, error } = await supabase.from("request_images").select("bytes").eq("patient_id", patientId);
  if (error) throw new Error("request_images: sum fejlede");
  return (data as { bytes: number }[]).reduce((total, row) => total + row.bytes, 0);
}

export async function getImage(
  supabase: SupabaseClient,
  requestId: string,
  imageId: string,
): Promise<ImageRecord | null> {
  const { data, error } = await supabase
    .from("request_images")
    .select(COLUMNS)
    .eq("request_id", requestId)
    .eq("id", imageId)
    .maybeSingle();
  if (error) throw new Error("request_images: select fejlede");
  return data ? toRecord(data as unknown as ImageRow) : null;
}

export async function insertImage(
  supabase: SupabaseClient,
  params: {
    id: string;
    requestId: string;
    patientId: string;
    consentId: string;
    storagePath: string;
    width: number;
    height: number;
    bytes: number;
  },
): Promise<void> {
  const { error } = await supabase.from("request_images").insert({
    id: params.id,
    request_id: params.requestId,
    patient_id: params.patientId,
    consent_id: params.consentId,
    storage_path: params.storagePath,
    width: params.width,
    height: params.height,
    bytes: params.bytes,
  });
  if (error) {
    mapDbError(error, { IMAGE_LIMIT: new ApiError(400, "IMAGE_LIMIT", "Du kan højst uploade 5 billeder pr. forespørgsel.") }, "request_images: insert fejlede");
  }
}

export async function deleteImageRow(supabase: SupabaseClient, imageId: string): Promise<void> {
  const { error } = await supabase.from("request_images").delete().eq("id", imageId);
  if (error) throw new Error("request_images: delete fejlede");
}

// --- Billedfiler i Supabase Storage (privat bucket) ---

// Stien indeholder bevidst IKKE patient_id, så signerede URL'er og mappenavne ikke afslører patienten
// for tandlæger (security-gennemgang 29687ebf).
export function imageStoragePath(requestId: string, imageId: string): string {
  return `${requestId}/${imageId}.jpg`;
}

// Signeret URL med brugerens JWT (storage-policies gælder). Logges aldrig.
export async function signedImageUrl(supabase: SupabaseClient, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(REQUEST_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

// Henter billedets bytes via brugerens JWT (storage-policies gælder). Bruges kun server-side til AI-udkast.
export async function downloadImageObject(supabase: SupabaseClient, path: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(REQUEST_BUCKET).download(path);
  if (error || !data) throw new ApiError(500, "DOWNLOAD_FAILED", "Billedet kunne ikke hentes. Prøv igen.");
  return Buffer.from(await data.arrayBuffer());
}

export async function uploadImageObject(supabase: SupabaseClient, path: string, data: Buffer): Promise<void> {
  const { error } = await supabase.storage
    .from(REQUEST_BUCKET)
    .upload(path, data, { contentType: "image/jpeg", upsert: false });
  if (error) {
    throw new ApiError(500, "UPLOAD_FAILED", "Billedet kunne ikke gemmes. Prøv igen.");
  }
}

export async function removeImageObject(supabase: SupabaseClient, path: string): Promise<void> {
  const { error } = await supabase.storage.from(REQUEST_BUCKET).remove([path]);
  if (error) throw new Error("storage: slet billede fejlede");
}

// Sletter flere filer i ét kald (bruges ved tilbagetrækning af image_upload-samtykke).
export async function removeImageObjects(admin: SupabaseClient, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from(REQUEST_BUCKET).remove(paths.slice(i, i + 100));
    if (error) throw new Error("storage: slet billeder fejlede");
  }
}
