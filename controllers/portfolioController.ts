import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { createPortfolioItemSchema, patchPortfolioItemSchema } from "@/lib/schemas/clinics";
import type { PortfolioItemDto } from "@/lib/types/clinics";
import type { Session } from "@/middleware/session";
import { ClinicDentistsRepository } from "@/models/clinicDentistsRepository";
import { ClinicsRepository } from "@/models/clinicsRepository";
import { lazyAdminClient } from "@/models/db/admin";
import { PortfolioRepository } from "@/models/portfolioRepository";
import { PublicMediaStorage } from "@/models/publicMediaStorage";
import { ServicesRepository } from "@/models/servicesRepository";
import { ImageProcessingService } from "@/services/imageProcessingService";

// Felterne fra multipart-formen. Skemaet har allerede sikret bekræftelsen og tekstversionen (architecture 9.5).
type CreatePortfolioInput = z.infer<typeof createPortfolioItemSchema>;
type PatchPortfolioInput = z.infer<typeof patchPortfolioItemSchema>;

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type PortfolioDeps = {
  clinics: ClinicsRepository;
  dentists: ClinicDentistsRepository;
  portfolio: PortfolioRepository;
  services: ServicesRepository;
  images: ImageProcessingService;
  admin: () => SupabaseClient;
};

// Porteføljebilleder (architecture 9.5, 10.8): offentlige billeder af udført arbejde. Klinikken bekræfter ved hvert
// upload, at patienten har givet samtykke til offentliggørelse; bekræftelsen og tekstversionen gemmes med billedet.
export class PortfolioController {
  private readonly clinics: ClinicsRepository;
  private readonly dentists: ClinicDentistsRepository;
  private readonly portfolio: PortfolioRepository;
  private readonly services: ServicesRepository;
  private readonly images: ImageProcessingService;
  // Service role-klienten (architecture 2.3, 2.1.1). Gives kun videre til public-media og rækkerne, efter ejertjekket.
  private readonly admin: () => SupabaseClient;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
    deps: Partial<PortfolioDeps> = {},
  ) {
    this.clinics = deps.clinics ?? new ClinicsRepository(supabase);
    this.dentists = deps.dentists ?? new ClinicDentistsRepository(supabase);
    this.portfolio = deps.portfolio ?? new PortfolioRepository(supabase);
    this.services = deps.services ?? new ServicesRepository(supabase);
    this.images = deps.images ?? new ImageProcessingService();
    this.admin = deps.admin ?? lazyAdminClient();
  }

  private requireClinicId(): Promise<string> {
    return this.clinics.requireOwnId(this.session.userId);
  }

  private async requireActiveService(serviceId: string | null | undefined): Promise<void> {
    if (serviceId) await this.services.requireActive([serviceId]);
  }

  // Tandlægen skal tilhøre klinikken (404 ellers). Filen re-encodes (EXIF fjernes), uploades og registreres; fejler
  // registreringen, fjernes filen igen.
  async create(input: CreatePortfolioInput, file: File): Promise<PortfolioItemDto> {
    const clinicId = await this.requireClinicId();
    await this.dentists.requireOwn(clinicId, input.dentistId);
    await this.requireActiveService(input.serviceId);
    // Loftet håndhæves af databasen (trigger, PORTFOLIO_LIMIT); repositoriet oversætter fejlen.

    const { data } = await this.images.reencode(Buffer.from(await file.arrayBuffer()));
    const id = randomUUID();
    const path = PublicMediaStorage.portfolioPath(clinicId, id);
    // 2.3 (d): upload i public-media og rækken (authenticated kan ikke indsætte), efter ejertjek og samtykkebekræftelse.
    const storage = new PublicMediaStorage(this.admin());
    await storage.upload(path, data, "image/jpeg");
    try {
      return await new PortfolioRepository(this.admin()).create({
        id,
        clinicId,
        dentistId: input.dentistId,
        serviceId: input.serviceId ?? null,
        imagePath: path,
        caption: input.caption ?? null,
        consentTextVersion: input.consentTextVersion,
      });
    } catch (err) {
      await storage.remove([path]).catch(() => {});
      throw err;
    }
  }

  async patch(itemId: string, input: PatchPortfolioInput): Promise<PortfolioItemDto> {
    const clinicId = await this.requireClinicId();
    await this.requireActiveService(input.serviceId);
    return this.portfolio.update(clinicId, itemId, input);
  }

  // Sletter rækken og filen. Rækken først, så en fejl ved filen ikke efterlader et billede, der ikke kan vises.
  async delete(itemId: string): Promise<void> {
    const clinicId = await this.requireClinicId();
    const path = await this.portfolio.requireOwnPath(clinicId, itemId);
    // 2.3 (d): sletning af række og fil i public-media efter ejertjekket.
    await new PortfolioRepository(this.admin()).delete(clinicId, itemId);
    await new PublicMediaStorage(this.admin()).remove([path]);
  }
}
