import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { MAX_DENTISTS_PER_CLINIC } from "@/lib/constants/clinics";
import { attachPortfolio } from "@/lib/domain/dentists";
import type { createDentistSchema, patchDentistSchema } from "@/lib/schemas/clinics";
import type { DentistDto } from "@/lib/types/clinics";
import { ApiError } from "@/middleware/http";
import type { Session } from "@/middleware/session";
import { ClinicDentistsRepository } from "@/models/clinicDentistsRepository";
import { ClinicsRepository } from "@/models/clinicsRepository";
import { lazyAdminClient } from "@/models/db/admin";
import { PortfolioRepository } from "@/models/portfolioRepository";
import { PublicMediaStorage } from "@/models/publicMediaStorage";
import { ImageProcessingService } from "@/services/imageProcessingService";

type CreateDentistInput = z.infer<typeof createDentistSchema>;
type PatchDentistInput = z.infer<typeof patchDentistSchema>;

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type ClinicDentistsDeps = {
  clinics: ClinicsRepository;
  dentists: ClinicDentistsRepository;
  portfolio: PortfolioRepository;
  images: ImageProcessingService;
  admin: () => SupabaseClient;
};

// Klinikkens tandlæger og deres portrætter (architecture 10.8). Tandlæger har intet login; de vises kun på profilen.
export class ClinicDentistsController {
  private readonly clinics: ClinicsRepository;
  private readonly dentists: ClinicDentistsRepository;
  private readonly portfolio: PortfolioRepository;
  private readonly images: ImageProcessingService;
  // Service role-klienten (architecture 2.3, 2.1.1). Gives kun videre til public-media, efter ejertjekket.
  private readonly admin: () => SupabaseClient;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
    deps: Partial<ClinicDentistsDeps> = {},
  ) {
    this.clinics = deps.clinics ?? new ClinicsRepository(supabase);
    this.dentists = deps.dentists ?? new ClinicDentistsRepository(supabase);
    this.portfolio = deps.portfolio ?? new PortfolioRepository(supabase);
    this.images = deps.images ?? new ImageProcessingService();
    this.admin = deps.admin ?? lazyAdminClient();
  }

  private requireClinicId(): Promise<string> {
    return this.clinics.requireOwnId(this.session.userId);
  }

  // Tandlæger med deres porteføljebilleder.
  async list(): Promise<DentistDto[]> {
    const clinicId = await this.requireClinicId();
    const [dentists, items] = await Promise.all([this.dentists.list(clinicId), this.portfolio.listForClinic(clinicId)]);
    return attachPortfolio(dentists, items);
  }

  async create(input: CreateDentistInput): Promise<DentistDto> {
    const clinicId = await this.requireClinicId();
    if ((await this.dentists.countForClinic(clinicId)) >= MAX_DENTISTS_PER_CLINIC) {
      throw new ApiError(429, "DENTIST_LIMIT", `Du kan højst oprette ${MAX_DENTISTS_PER_CLINIC} tandlæger.`);
    }
    return { ...(await this.dentists.create(clinicId, input)), portfolio: [] };
  }

  async patch(dentistId: string, input: PatchDentistInput): Promise<DentistDto> {
    const clinicId = await this.requireClinicId();
    const dentist = await this.dentists.update(clinicId, dentistId, input);
    const items = await this.portfolio.listForClinic(clinicId);
    return attachPortfolio([dentist], items)[0];
  }

  // Sletter tandlægen, portrættet og porteføljen (rækkerne følger med via cascade). Rækken slettes først, så en
  // fejl ved filerne efterlader ubrugelige filer frem for en profil med knækkede billeder.
  async delete(dentistId: string): Promise<void> {
    const clinicId = await this.requireClinicId();
    await this.dentists.requireOwn(clinicId, dentistId);
    const portfolioPaths = await this.portfolio.listPathsForDentist(clinicId, dentistId);
    await this.dentists.delete(clinicId, dentistId);
    // 2.3 (d): sletning i public-media efter ejertjekket.
    await new PublicMediaStorage(this.admin()).remove([
      PublicMediaStorage.dentistPhotoPath(clinicId, dentistId),
      ...portfolioPaths,
    ]);
  }

  // Portræt (architecture 9.5). Filen læses først efter ejertjekket (`readFile`).
  async uploadPhoto(dentistId: string, readFile: () => Promise<File>): Promise<{ photoUrl: string }> {
    const clinicId = await this.requireClinicId();
    await this.dentists.requireOwn(clinicId, dentistId);
    const file = await readFile();
    const { data } = await this.images.reencode(Buffer.from(await file.arrayBuffer()));
    const path = PublicMediaStorage.dentistPhotoPath(clinicId, dentistId);
    // 2.3 (d): upload i public-media efter ejertjekket.
    await new PublicMediaStorage(this.admin()).replace(path, data, "image/jpeg");
    // 2.3 (d): photo_path og photo_updated_at er ikke i kolonne-grants (M1); skrives af serveren efter upload.
    const version = await new ClinicDentistsRepository(this.admin()).setPhotoPath(clinicId, dentistId, path);
    return { photoUrl: PublicMediaStorage.publicUrl(path, Date.parse(version)) };
  }

  async deletePhoto(dentistId: string): Promise<void> {
    const clinicId = await this.requireClinicId();
    await this.dentists.requireOwn(clinicId, dentistId);
    // 2.3 (d): photo_path skrives af serveren (M1).
    await new ClinicDentistsRepository(this.admin()).setPhotoPath(clinicId, dentistId, null);
    // 2.3 (d): sletning i public-media efter ejertjekket.
    await new PublicMediaStorage(this.admin()).remove([PublicMediaStorage.dentistPhotoPath(clinicId, dentistId)]);
  }
}
