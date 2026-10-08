import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, notFound } from "@/middleware/http";
import type { Session } from "@/middleware/session";
import { CONSENT_TEXT_VERSIONS } from "@/lib/constants/consents";
import { ANON_MAX_TOTAL_IMAGE_BYTES, MAX_IMAGES_PER_REQUEST, MAX_IMAGE_UPLOAD_BYTES } from "@/lib/constants/limits";
import type { UploadedImageDto } from "@/lib/types/requests";
import { createSupabaseAdminClient } from "@/models/db/admin";
import { requireOwnRequest } from "@/models/requestsModel";
import { getLatestConsent } from "@/models/consentsModel";
import {
  deleteImageRow,
  getImage,
  imageStoragePath,
  insertImage,
  listImages,
  removeImageObject,
  signedImageUrl,
  sumImageBytes,
  uploadImageObject,
} from "@/models/imagesModel";
import { reencodeImage } from "@/services/imageProcessing";

// Upload kræver et aktivt image_upload-samtykke, givet lige før upload (architecture 9.3, 9.4).
// Vilkårs-accept giver ingen ret til upload.
export async function uploadRequestImage(
  supabase: SupabaseClient,
  session: Session,
  requestId: string,
  readFile: () => Promise<File>,
): Promise<UploadedImageDto> {
  const record = await requireOwnRequest(supabase, requestId, session.userId);
  if (record.status !== "draft") {
    throw new ApiError(409, "NOT_DRAFT", "Forespørgslen er sendt og kan ikke ændres.");
  }

  const consent = await getLatestConsent(supabase, "image_upload");
  if (!consent || consent.withdrawnAt !== null || consent.textVersion !== CONSENT_TEXT_VERSIONS.image_upload) {
    throw new ApiError(403, "CONSENT_REQUIRED", "Du skal give samtykke til billeder (nyeste version), før du uploader.");
  }
  const aiConsent = await getLatestConsent(supabase, "ai_processing");
  if (!aiConsent || aiConsent.withdrawnAt !== null) {
    throw new ApiError(403, "CONSENT_REQUIRED", "Du skal give samtykke til AI-behandling, før du uploader billeder.");
  }

  const existing = await listImages(supabase, requestId);
  if (existing.length >= MAX_IMAGES_PER_REQUEST) {
    throw new ApiError(400, "IMAGE_LIMIT", "Du kan højst uploade 5 billeder pr. forespørgsel.");
  }

  // Filen læses først her, efter ejer-, kladde-, samtykke- og antalstjek (architecture 9.3).
  const file = await readFile();
  const original = Buffer.from(await file.arrayBuffer());
  const processed = await reencodeImage(original);
  if (processed.data.length > MAX_IMAGE_UPLOAD_BYTES) {
    throw new ApiError(413, "FILE_TOO_LARGE", "Billedet er for stort efter behandling.");
  }

  if (session.isAnonymous) {
    const used = await sumImageBytes(supabase, session.userId);
    if (used + processed.data.length > ANON_MAX_TOTAL_IMAGE_BYTES) {
      throw new ApiError(413, "ANON_STORAGE_LIMIT", "Der er for mange billeder i din samtale. Opret en konto for at fortsætte.");
    }
  }

  const imageId = randomUUID();
  const path = imageStoragePath(requestId, imageId);
  // Skrivning sker med service role efter re-encoding. Brugerens JWT må ikke skrive billeder (architecture 9.2).
  const admin = createSupabaseAdminClient();
  await uploadImageObject(admin, path, processed.data);
  try {
    await insertImage(admin, {
      id: imageId,
      requestId,
      patientId: session.userId,
      consentId: consent.id,
      storagePath: path,
      width: processed.width,
      height: processed.height,
      bytes: processed.data.length,
    });
  } catch (err) {
    await removeImageObject(admin, path).catch(() => undefined);
    throw err;
  }

  const url = await signedImageUrl(supabase, path);
  if (!url) {
    throw new ApiError(500, "SIGNED_URL_FAILED", "Billedet blev gemt, men kan ikke vises endnu.");
  }
  return { id: imageId, url, view: null, quality: null };
}

export async function deleteRequestImage(
  supabase: SupabaseClient,
  session: Session,
  requestId: string,
  imageId: string,
): Promise<void> {
  const record = await requireOwnRequest(supabase, requestId, session.userId);
  if (record.status !== "draft") {
    throw new ApiError(409, "NOT_DRAFT", "Forespørgslen er sendt og kan ikke ændres.");
  }
  const image = await getImage(supabase, requestId, imageId);
  if (!image) throw notFound();
  const admin = createSupabaseAdminClient();
  await removeImageObject(admin, image.storagePath);
  await deleteImageRow(admin, imageId);
}
