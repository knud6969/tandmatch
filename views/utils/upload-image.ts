import { apiRequest } from "@/views/utils/api-client";
import { prepareImage } from "@/views/utils/prepare-image";

type UploadOptions = {
  // Længste side i pixels efter nedskalering. Standard er MAX_IMAGE_DIMENSION.
  maxDimension?: number;
  // Ekstra formularfelter, der sendes sammen med filen.
  fields?: Record<string, string>;
};

// Nedskalerer billedet i browseren og uploader det som multipart til `url` (POST). Kaster ImagePrepareError, hvis billedet
// ikke kan bruges, og ApiRequestError, hvis serveren afviser det.
export async function uploadImage<T>(url: string, file: File, options: UploadOptions = {}): Promise<T> {
  const prepared = await prepareImage(file, options.maxDimension);
  const form = new FormData();
  form.set("file", prepared);
  for (const [name, value] of Object.entries(options.fields ?? {})) form.set(name, value);
  return apiRequest<T>(url, { method: "POST", form });
}
