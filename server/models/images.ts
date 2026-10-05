import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/server/http/api";
import { mapDbError } from "@/server/http/db-errors";

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
