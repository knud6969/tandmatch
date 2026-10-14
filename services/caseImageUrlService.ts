import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/constants/limits";
import type { ImageDto } from "@/lib/types/common";
import type { CaseImageRecord } from "@/models/caseImagesRepository";
import { CaseImageStorage } from "@/models/caseImageStorage";

// Gør billedrækker til ImageDto med korte, signerede URL'er (architecture 9.2). Kalderen har allerede læst rækkerne
// med patientens JWT (RLS), så kun ejerens billeder når hertil. Service role-klienten oprettes først, når der er noget
// at signere (2.3 e). Signerede URL'er logges ikke.
export class CaseImageUrlService {
  constructor(
    private readonly admin: () => SupabaseClient,
    private readonly ttlSeconds: number = SIGNED_URL_TTL_SECONDS,
  ) {}

  async toDtos(images: readonly CaseImageRecord[]): Promise<ImageDto[]> {
    if (images.length === 0) return [];
    const urls = await new CaseImageStorage(this.admin()).signedUrls(
      images.map((image) => image.storagePath),
      this.ttlSeconds,
    );
    return images.map((image, i) => ({ id: image.id, url: urls[i], view: image.view, quality: image.quality }));
  }
}
