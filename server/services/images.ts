import "server-only";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/server/http/api";
import { MAX_IMAGE_DIMENSION, REQUEST_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/lib/constants/limits";

export type ImageKind = "jpeg" | "png" | "heic";

// Kigger på de første bytes (magic bytes). Filtypen fra klienten stoles ikke på.
export function detectImageKind(buf: Buffer): ImageKind | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (buf.length >= 12 && buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("ascii");
    if (["heic", "heix", "mif1", "msf1", "heim", "heis", "hevc"].includes(brand)) return "heic";
  }
  return null;
}

// Re-encoder til JPEG. Fjerner EXIF (GPS, enhed) og retter rotation. Max 2048 px.
export async function reencodeImage(buf: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  if (detectImageKind(buf) === null) {
    throw new ApiError(400, "INVALID_IMAGE", "Billedet skal være JPEG, PNG eller HEIC.");
  }
  try {
    const out = await sharp(buf, { failOn: "error", limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    return { data: out.data, width: out.info.width, height: out.info.height };
  } catch {
    throw new ApiError(400, "INVALID_IMAGE", "Billedet kunne ikke behandles.");
  }
}

export function imageStoragePath(patientId: string, requestId: string, imageId: string): string {
  return `${patientId}/${requestId}/${imageId}.jpg`;
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
