// Nedskalerer og genkoder billeder i browseren, før de uploades (architecture 9.3, 9.5).
// Resultatet er altid et JPEG under MAX_IMAGE_UPLOAD_BYTES. Serveren genkoder igen og fjerner EXIF; det her er for at
// undgå fejl ved store mobilbilleder og for at spare båndbredde.
import { MAX_IMAGE_DIMENSION, MAX_IMAGE_UPLOAD_BYTES } from "@/lib/common/constants/limits";

export class ImagePrepareError extends Error {}

const ACCEPTED_TYPES = ["image/jpeg", "image/png"];
const QUALITIES = [0.9, 0.8, 0.7, 0.6];

// Værdi til <input accept>.
export const IMAGE_ACCEPT = ACCEPTED_TYPES.join(",");

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function prepareImage(file: File, maxDimension: number = MAX_IMAGE_DIMENSION): Promise<File> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new ImagePrepareError("Vælg et billede i JPEG- eller PNG-format.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImagePrepareError("Billedet kunne ikke læses. Vælg et andet billede.");
  }

  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      throw new ImagePrepareError("Billedet kunne ikke behandles i din browser. Prøv et andet billede.");
    }
    // Hvid baggrund, så gennemsigtige PNG-billeder ikke bliver sorte i JPEG.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    for (const quality of QUALITIES) {
      const blob = await toBlob(canvas, quality);
      if (!blob) break;
      if (blob.size <= MAX_IMAGE_UPLOAD_BYTES) {
        const name = file.name.replace(/\.[^.]+$/, "") || "billede";
        return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
      }
    }
    throw new ImagePrepareError(
      `Billedet er for stort. Vælg et billede på højst ${MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024)} MB.`,
    );
  } finally {
    bitmap.close();
  }
}
