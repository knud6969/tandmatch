import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaseImageRecord } from "@/models/caseImagesRepository";
import { CaseImageStorage } from "@/models/caseImageStorage";
import { ImageProcessingService } from "@/services/imageProcessingService";

// Max kant på billeder, der sendes til AI'en (architecture 7.2).
export const AI_IMAGE_MAX_DIMENSION = 1024;

// Gør sagens billeder klar til modellen: filen hentes fra den private bucket, re-encodes (EXIF fjernet, max 1024 px) og
// gives som base64. Signerede URL'er sendes aldrig. Kalderen har tjekket ejer og image_upload-samtykke. Indhold logges ikke.
export class AiImageService {
  constructor(
    private readonly admin: () => SupabaseClient,
    private readonly processing: ImageProcessingService = new ImageProcessingService(AI_IMAGE_MAX_DIMENSION),
  ) {}

  async load(images: readonly CaseImageRecord[]): Promise<{ imageId: string; data: string }[]> {
    if (images.length === 0) return [];
    // 2.3 (c): filerne læses med service role, efter ejer- og samtykketjek.
    const storage = new CaseImageStorage(this.admin());
    const out: { imageId: string; data: string }[] = [];
    for (const image of images) {
      const original = await storage.download(image.storagePath);
      const { data } = await this.processing.reencode(original);
      out.push({ imageId: image.id, data: data.toString("base64") });
    }
    return out;
  }
}
