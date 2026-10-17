import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_IMAGES_PER_CASE, MAX_IMAGE_UPLOAD_BYTES } from "@/lib/constants/limits";
import type { ImageDto } from "@/lib/types/common";
import { ApiError, consentRequired } from "@/middleware/http";
import type { Session } from "@/middleware/session";
import { CaseImageStorage } from "@/models/caseImageStorage";
import { CaseImagesRepository } from "@/models/caseImagesRepository";
import { CasesRepository } from "@/models/casesRepository";
import { ConsentsRepository } from "@/models/consentsRepository";
import { lazyAdminClient } from "@/models/db/admin";
import { CaseImageUrlService } from "@/services/caseImageUrlService";
import { ImageProcessingService } from "@/services/imageProcessingService";

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type CaseImagesDeps = {
  cases: CasesRepository;
  images: CaseImagesRepository;
  consents: ConsentsRepository;
  processing: ImageProcessingService;
  imageUrls: CaseImageUrlService;
  admin: () => SupabaseClient;
};

// Sagens billeder (architecture 9.3, 10.5). Mundfotos er helbredsdata: upload kræver aktivt image_upload-samtykke, og
// filen læses først efter ejer-, kladde-, samtykke- og antalstjek. Filen re-encodes uden EXIF og gemmes med service role.
export class CaseImagesController {
  private readonly cases: CasesRepository;
  private readonly images: CaseImagesRepository;
  private readonly consents: ConsentsRepository;
  private readonly processing: ImageProcessingService;
  private readonly imageUrls: CaseImageUrlService;
  // Service role-klienten (architecture 2.3, 2.1.1). Bruges kun til billedfiler og case_images-rækker, efter tjekkene.
  private readonly admin: () => SupabaseClient;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
    deps: Partial<CaseImagesDeps> = {},
  ) {
    this.admin = deps.admin ?? lazyAdminClient();
    this.cases = deps.cases ?? new CasesRepository(supabase);
    this.images = deps.images ?? new CaseImagesRepository(supabase);
    this.consents = deps.consents ?? new ConsentsRepository(supabase);
    this.processing = deps.processing ?? new ImageProcessingService();
    this.imageUrls = deps.imageUrls ?? new CaseImageUrlService(this.admin);
  }

  // `readFile` læser multipart-bodyen og kaldes først, når alle tjek er bestået (architecture 9.3).
  async upload(caseId: string, readFile: () => Promise<File>): Promise<ImageDto> {
    await this.cases.requireOwnDraft(caseId);

    // Samtykket skal være aktivt og den nuværende tekstversion. Vilkårs-accept giver ingen ret til upload (9.4).
    const consent = await this.consents.findCurrentActive("image_upload");
    if (!consent) {
      throw consentRequired("Du skal give samtykke til billeder (nyeste version), før du uploader.");
    }

    const existing = await this.images.listForCase(caseId);
    if (existing.length >= MAX_IMAGES_PER_CASE) {
      throw new ApiError(400, "IMAGE_LIMIT", `Du kan højst uploade ${MAX_IMAGES_PER_CASE} billeder pr. sag.`);
    }

    const file = await readFile();
    const { data, width, height } = await this.processing.reencode(Buffer.from(await file.arrayBuffer()));
    if (data.length > MAX_IMAGE_UPLOAD_BYTES) {
      throw new ApiError(413, "FILE_TOO_LARGE", "Billedet er for stort efter behandling.");
    }

    const id = randomUUID();
    const path = CaseImageStorage.pathFor(caseId, id);
    // 2.3 (c): filen og case_images-rækken skrives med service role efter ejer-, kladde- og samtykketjek.
    const storage = new CaseImageStorage(this.admin());
    await storage.upload(path, data, "image/jpeg");
    try {
      await new CaseImagesRepository(this.admin()).create({
        id,
        caseId,
        patientId: this.session.userId,
        consentId: consent.id,
        storagePath: path,
        width,
        height,
        bytes: data.length,
      });
    } catch (err) {
      await storage.remove([path]).catch(() => {});
      throw err;
    }

    const [dto] = await this.imageUrls.toDtos([{ id, caseId, storagePath: path, view: null, quality: null, description: null, bytes: data.length }]);
    return dto;
  }

  // Sletter rækken og filen. Rækken først, så en fejl ved filen ikke efterlader et billede, der ikke kan vises.
  async delete(caseId: string, imageId: string): Promise<void> {
    await this.cases.requireOwnDraft(caseId);
    const image = await this.images.requireInCase(caseId, imageId);
    // 2.3 (c): rækken og filen slettes med service role efter ejer- og kladdetjek.
    await new CaseImagesRepository(this.admin()).delete(image.id);
    await new CaseImageStorage(this.admin()).remove([image.storagePath]);
  }
}
