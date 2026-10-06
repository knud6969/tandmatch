// Klientside klargøring af billeder før upload (architecture 9.3, punkt 3).
// Kun JPEG. Store billeder skaleres ned til højst 2048 px og genkodes som JPEG, så de bliver under 4 MB.
// Serveren genkoder igen og fjerner EXIF; dette er kun for at undgå fejl ved store filer.
import { MAX_IMAGE_DIMENSION, MAX_IMAGE_UPLOAD_BYTES } from "@/lib/constants/limits";

const MAX_UPLOAD_BYTES = MAX_IMAGE_UPLOAD_BYTES;
const MAX_DIMENSION = MAX_IMAGE_DIMENSION;

export class ImagePrepareError extends Error {}

export async function prepareJpeg(file: File): Promise<Blob> {
  if (file.type !== "image/jpeg") {
    throw new ImagePrepareError("Vælg et billede i JPEG-format (.jpg eller .jpeg).");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImagePrepareError("Billedet kunne ikke læses. Vælg et andet billede.");
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= MAX_UPLOAD_BYTES) {
    bitmap.close();
    return file;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new ImagePrepareError("Billedet kunne ikke behandles i din browser. Prøv et andet billede.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) {
    throw new ImagePrepareError("Billedet kunne ikke behandles i din browser. Prøv et andet billede.");
  }
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new ImagePrepareError("Billedet er for stort. Vælg et billede på højst 4 MB.");
  }
  return blob;
}
