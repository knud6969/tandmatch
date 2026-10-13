import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { attachPortfolio } from "@/lib/domain/dentists";
import type {
  createTimeBlockSchema,
  patchClinicSchema,
  putOpeningHoursSchema,
  putPricesSchema,
  putServiceGroupsSchema,
  timeBlocksQuerySchema,
} from "@/lib/schemas/clinics";
import type { ClinicPriceDto, ClinicRecordDto, OpeningHoursDto, OwnClinicDto, TimeBlockDto } from "@/lib/types/clinics";
import { ApiError } from "@/middleware/http";
import type { Session } from "@/middleware/session";
import { AvailabilityRepository } from "@/models/availabilityRepository";
import { ClinicDentistsRepository } from "@/models/clinicDentistsRepository";
import { ClinicsRepository } from "@/models/clinicsRepository";
import { lazyAdminClient } from "@/models/db/admin";
import { PortfolioRepository } from "@/models/portfolioRepository";
import { PublicMediaStorage } from "@/models/publicMediaStorage";
import { ServicesRepository } from "@/models/servicesRepository";
import { AccountDeletionService } from "@/services/accountDeletionService";
import { ImageProcessingService } from "@/services/imageProcessingService";

type PatchClinicInput = z.infer<typeof patchClinicSchema>;
type PutPricesInput = z.infer<typeof putPricesSchema>;
type PutServiceGroupsInput = z.infer<typeof putServiceGroupsSchema>;
type PutOpeningHoursInput = z.infer<typeof putOpeningHoursSchema>;
type CreateTimeBlockInput = z.infer<typeof createTimeBlockSchema>;
type TimeBlocksQuery = z.infer<typeof timeBlocksQuerySchema>;

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type ClinicsDeps = {
  clinics: ClinicsRepository;
  availability: AvailabilityRepository;
  dentists: ClinicDentistsRepository;
  portfolio: PortfolioRepository;
  services: ServicesRepository;
  images: ImageProcessingService;
  admin: () => SupabaseClient;
};

// Egen klinik: profil, prisliste, åbningstider, blokeringer, logo og sletning (architecture 10.8).
// Alle metoder arbejder på sessionens egen klinik; en andens klinik kan aldrig nævnes i et kald.
export class ClinicsController {
  private readonly clinics: ClinicsRepository;
  private readonly availability: AvailabilityRepository;
  private readonly dentists: ClinicDentistsRepository;
  private readonly portfolio: PortfolioRepository;
  private readonly services: ServicesRepository;
  private readonly images: ImageProcessingService;
  // Service role-klienten (architecture 2.3, 2.1.1). Gives kun videre til public-media, logo-stien og kontosletningen.
  private readonly admin: () => SupabaseClient;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
    deps: Partial<ClinicsDeps> = {},
  ) {
    this.clinics = deps.clinics ?? new ClinicsRepository(supabase);
    this.availability = deps.availability ?? new AvailabilityRepository(supabase);
    this.dentists = deps.dentists ?? new ClinicDentistsRepository(supabase);
    this.portfolio = deps.portfolio ?? new PortfolioRepository(supabase);
    this.services = deps.services ?? new ServicesRepository(supabase);
    this.images = deps.images ?? new ImageProcessingService();
    this.admin = deps.admin ?? lazyAdminClient();
  }

  private requireClinic(): Promise<ClinicRecordDto> {
    return this.clinics.requireOwn(this.session.userId);
  }

  private requireClinicId(): Promise<string> {
    return this.clinics.requireOwnId(this.session.userId);
  }

  private logoUrl(clinic: ClinicRecordDto): string | null {
    if (!clinic.logoPath) return null;
    return PublicMediaStorage.publicUrl(clinic.logoPath, clinic.logoUpdatedAt ? Date.parse(clinic.logoUpdatedAt) : undefined);
  }

  // Forhåndsvisning af den fulde profil uanset status (architecture 10.8).
  async get(): Promise<OwnClinicDto> {
    return this.buildProfile(await this.requireClinic());
  }

  private async buildProfile(clinic: ClinicRecordDto): Promise<OwnClinicDto> {
    const [prices, openingHours, dentists, portfolio] = await Promise.all([
      this.clinics.listPrices(clinic.id),
      this.availability.listOpeningHours(clinic.id),
      this.dentists.list(clinic.id),
      this.portfolio.listForClinic(clinic.id),
    ]);
    return {
      id: clinic.id,
      name: clinic.name,
      tier: "full",
      canReceiveLeads: clinic.status === "verified",
      address: clinic.address,
      postalCode: clinic.postalCode,
      city: clinic.city,
      location: clinic.location,
      phone: clinic.phone,
      website: clinic.website,
      openingHours,
      distanceKm: null,
      trustpilot: clinic.trustpilot,
      reviewStats: null,
      logoUrl: this.logoUrl(clinic),
      prices,
      priceForSelection: null,
      firstAvailableAt: null,
      firstEmergencyAt: null,
      description: clinic.description,
      email: clinic.email,
      allPrices: prices,
      dentists: attachPortfolio(dentists, portfolio),
      status: clinic.status,
      cvr: clinic.cvr ?? "",
    };
  }

  // Trustpilot-ændring sætter trustpilot_entered_by = 'clinic' (trigger clinics_guard(), architecture 4.3).
  // Score og antal giver kun mening sammen med et link, så det tjekkes mod de værdier, der gælder efter ændringen.
  async patch(input: PatchClinicInput): Promise<OwnClinicDto> {
    const current = await this.requireClinic();
    const url = input.trustpilotUrl !== undefined ? input.trustpilotUrl : (current.trustpilot?.url ?? null);
    const score = input.trustpilotScore !== undefined ? input.trustpilotScore : (current.trustpilot?.score ?? null);
    const count =
      input.trustpilotReviewCount !== undefined ? input.trustpilotReviewCount : (current.trustpilot?.reviewCount ?? null);
    if (url === null && (score !== null || count !== null)) {
      throw new ApiError(400, "TRUSTPILOT_URL_REQUIRED", "Angiv linket til din Trustpilot-side sammen med scoren.");
    }
    const updated = await this.clinics.update(current.id, input);
    return this.buildProfile(updated);
  }

  // Sletter kontoen (architecture 10.8). Bekræftelsen ("SLET") er valideret i routen. Klinikken bliver `imported`;
  // routen rydder cookies bagefter.
  async deleteAccount(): Promise<void> {
    // Klinik-id'et hentes med brugerens egen klient (ejertjek); service role bruges kun til filer og auth-bruger.
    const clinicId = await this.requireClinicId();
    // 2.3 (d, f): filer i public-media og auth-brugeren. Triggeren clinics_after_owner_removed() rydder rækkerne (5.3).
    await new AccountDeletionService(this.admin()).deleteClinicAccount(clinicId, this.session.userId);
  }

  async listServiceGroupIds(): Promise<string[]> {
    return this.clinics.listServiceGroupIds(await this.requireClinicId());
  }

  // Erstatter de valgte kategorier; priser i fravalgte kategorier slettes i samme transaktion (5.3).
  async putServiceGroups(input: PutServiceGroupsInput): Promise<string[]> {
    await this.requireClinicId();
    return this.clinics.setServiceGroups(input.groupIds);
  }

  async listPrices(): Promise<ClinicPriceDto[]> {
    return this.clinics.listPrices(await this.requireClinicId());
  }

  // Erstatter hele prislisten i én transaktion. Kun aktive behandlinger i kategorier, klinikken har valgt (409
  // SERVICE_GROUP_NOT_SELECTED); databasen tjekker det samme i triggeren.
  async putPrices(input: PutPricesInput): Promise<ClinicPriceDto[]> {
    const clinicId = await this.requireClinicId();
    const services = await this.services.requireActive(input.prices.map((price) => price.serviceId));
    const selected = new Set(await this.clinics.listServiceGroupIds(clinicId));
    if (services.some((service) => !selected.has(service.groupId))) {
      throw new ApiError(409, "SERVICE_GROUP_NOT_SELECTED", "Vælg først kategorien, før du angiver priser i den.");
    }
    await this.clinics.replacePrices(input.prices);
    return this.clinics.listPrices(clinicId);
  }

  async listOpeningHours(): Promise<OpeningHoursDto[]> {
    return this.availability.listOpeningHours(await this.requireClinicId());
  }

  // Erstatter alle åbningstider (overlap er afvist af skemaet og af triggeren).
  async putOpeningHours(input: PutOpeningHoursInput): Promise<OpeningHoursDto[]> {
    const clinicId = await this.requireClinicId();
    await this.availability.replaceOpeningHours(input.hours);
    return this.availability.listOpeningHours(clinicId);
  }

  async listTimeBlocks(query: TimeBlocksQuery): Promise<TimeBlockDto[]> {
    return this.availability.listTimeBlocks(await this.requireClinicId(), query);
  }

  async createTimeBlock(input: CreateTimeBlockInput): Promise<TimeBlockDto> {
    return this.availability.createTimeBlock(await this.requireClinicId(), input);
  }

  // 404, hvis blokeringen ikke tilhører klinikken.
  async deleteTimeBlock(blockId: string): Promise<void> {
    await this.availability.deleteTimeBlock(await this.requireClinicId(), blockId);
  }

  // Logo (architecture 9.5): samme behandling som patientbilleder (magic bytes, re-encoding, EXIF fjernes).
  // Filen læses først efter ejertjekket (`readFile`).
  async uploadLogo(readFile: () => Promise<File>): Promise<{ logoUrl: string }> {
    const clinic = await this.requireClinic();
    const file = await readFile();
    const { data } = await this.images.reencode(Buffer.from(await file.arrayBuffer()));
    const path = PublicMediaStorage.logoPath(clinic.id);
    // 2.3 (d): upload i public-media og logo_path (ikke i kolonne-grants), efter ejertjekket.
    await new PublicMediaStorage(this.admin()).replace(path, data, "image/jpeg");
    const version = await new ClinicsRepository(this.admin()).setLogoPath(clinic.id, path);
    return { logoUrl: PublicMediaStorage.publicUrl(path, Date.parse(version)) };
  }

  async deleteLogo(): Promise<void> {
    const clinic = await this.requireClinic();
    if (!clinic.logoPath) return;
    // 2.3 (d): sletning i public-media og logo_path efter ejertjekket.
    await new PublicMediaStorage(this.admin()).remove([clinic.logoPath]);
    await new ClinicsRepository(this.admin()).setLogoPath(clinic.id, null);
  }
}
