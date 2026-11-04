import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FavoriteClinicsDto, FavoriteIdsDto } from "@/lib/clinics/types/favorites";
import type { Session } from "@/platform/middleware/session";
import { AvailabilityRepository } from "@/features/clinics/availabilityRepository";
import { ClinicDirectoryRepository } from "@/features/clinics/clinicDirectoryRepository";
import { ClinicListingService } from "@/features/clinics/clinicListingService";
import { FavoritesRepository } from "@/features/clinics/favoritesRepository";
import { ServicesRepository } from "@/features/clinics/servicesRepository";
import { AvailabilityService } from "@/features/clinics/availabilityService";
import { RankingService } from "@/features/clinics/rankingService";
import { ReviewsRepository } from "@/features/booking";

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type FavoritesDeps = { favorites: FavoritesRepository; directory: ClinicDirectoryRepository; listing: ClinicListingService };

// Patientens gemte klinikker (clinics 10.17). Routen har afvist anonyme og andre roller; databasen tjekker det igen.
// Listen bruger oversigtens mapping (ClinicListingService) og viser kun klinikker, der stadig er offentlige.
export class FavoritesController {
  private readonly favorites: FavoritesRepository;
  private readonly directory: ClinicDirectoryRepository;
  private readonly listing: ClinicListingService;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
    deps: Partial<FavoritesDeps> = {},
  ) {
    this.favorites = deps.favorites ?? new FavoritesRepository(supabase);
    this.directory = deps.directory ?? new ClinicDirectoryRepository(supabase);
    this.listing =
      deps.listing ??
      new ClinicListingService({
        reviews: new ReviewsRepository(supabase),
        availability: new AvailabilityRepository(supabase),
        services: new ServicesRepository(supabase),
        ranking: new RankingService(),
        slots: new AvailabilityService(),
      });
  }

  // Id'er på gemte klinikker, der stadig vises offentligt (hjertet i listen og på profilen).
  async ids(): Promise<FavoriteIdsDto> {
    const records = await this.visible();
    return { clinicIds: records.map((record) => record.id) };
  }

  // De gemte klinikker som oversigtens kort uden valgte behandlinger, sorteret efter navn.
  async list(): Promise<FavoriteClinicsDto> {
    const records = await this.visible();
    if (records.length === 0) return { clinics: [] };
    const plan = await this.listing.plan([]);
    const context = await this.listing.contextFor(records);
    const clinics = records.map((record) => this.listing.toListItem(record, plan, context, null));
    clinics.sort((a, b) => a.name.localeCompare(b.name, "da"));
    return { clinics };
  }

  add(clinicId: string): Promise<void> {
    return this.favorites.add(this.session.userId, clinicId);
  }

  remove(clinicId: string): Promise<void> {
    return this.favorites.remove(clinicId);
  }

  private async visible() {
    const saved = await this.favorites.listOwn();
    if (saved.length === 0) return [];
    return this.directory.listClinics([], saved.map((favorite) => favorite.clinicId));
  }
}
