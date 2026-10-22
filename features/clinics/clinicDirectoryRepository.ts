import "server-only";
import type { ZodType } from "zod";
import {
  publicDentistsJsonSchema,
  publicOpeningHoursJsonSchema,
  publicPricesJsonSchema,
} from "@/lib/clinics/schemas/clinics";
import type { ClinicListItemDto, ClinicPriceDto, ClinicProfileDto, OpeningHoursDto } from "@/lib/clinics/types/clinics";
import { BaseRepository } from "@/platform/base/baseRepository";
import type { Database } from "@/platform/db/database.types";
import { trustpilotFromColumns, type WithNulls } from "@/platform/db/mappers";
import { PublicMediaStorage } from "@/features/clinics/publicMediaStorage";

// En klinik som public_clinics()/public_clinic_profile() viser den, før controlleren har lagt afstand, anmeldelsesstatistik,
// pris for valget og første ledige tid på (architecture 10.7). `prices` er alle priser for de forespurgte behandlinger.
export type PublicClinicRecord = Omit<
  ClinicListItemDto,
  "distanceKm" | "reviewStats" | "priceForSelection" | "firstAvailableAt" | "firstEmergencyAt"
>;
export type PublicClinicProfileRecord = PublicClinicRecord &
  Pick<ClinicProfileDto, "description" | "email" | "allPrices" | "dentists">;

type Functions = Database["public"]["Functions"];
type Generated = Functions["public_clinics"]["Returns"][number];
type GeneratedProfile = Functions["public_clinic_profile"]["Returns"][number];

// De genererede typer for `returns table` markerer ikke nullable kolonner; de er angivet her.
type NullableColumns =
  | "lat"
  | "lng"
  | "phone"
  | "website"
  | "trustpilot_url"
  | "trustpilot_score"
  | "trustpilot_review_count"
  | "trustpilot_updated_at"
  | "trustpilot_entered_by"
  | "logo_path"
  | "logo_updated_at"
  | "has_emergency_hours";
type PublicClinicRow = WithNulls<Generated, NullableColumns>;
type PublicProfileRow = WithNulls<GeneratedProfile, NullableColumns | "description" | "email">;

// Offentlig klinikoversigt og -profil (architecture 5.3, 10.7): al læsning går gennem public_*-funktionerne, som kun viser
// verificerede klinikker (fuldt niveau) og importerede klinikker uden ejer (basisniveau). `registered` og `removed` er
// usynlige og giver derfor ingen række. Funktionerne kan kaldes af alle, også uden session.
export class ClinicDirectoryRepository extends BaseRepository<PublicClinicRow, PublicClinicRecord> {
  // jsonb parses med zod (architecture 2.1.1). Ugyldigt indhold behandles som tomt og logges uden indhold.
  private parseJson<T>(schema: ZodType<T>, value: unknown, what: string): T | null {
    if (value === null || value === undefined) return null; // basisniveau har ingen priser eller tandlæger
    const parsed = schema.safeParse(value);
    if (parsed.success) return parsed.data;
    console.error(`public_*: ugyldigt jsonb-felt (${what})`);
    return null;
  }

  private openingHours(value: unknown): OpeningHoursDto[] {
    const rows = this.parseJson(publicOpeningHoursJsonSchema, value, "opening_hours") ?? [];
    return rows.map((row) => ({
      weekday: row.weekday,
      opensAt: row.opens_at,
      closesAt: row.closes_at,
      isEmergency: row.is_emergency,
    }));
  }

  private prices(value: unknown): ClinicPriceDto[] {
    const rows = this.parseJson(publicPricesJsonSchema, value, "prices") ?? [];
    return rows.map((row) => ({
      serviceId: row.service_id,
      serviceSlug: row.service_slug,
      serviceName: row.service_name,
      price: { min: row.price_min, max: row.price_max },
      durationMin: row.duration_min,
      note: row.note,
    }));
  }

  protected toDto(row: PublicClinicRow): PublicClinicRecord {
    const verified = row.status === "verified";
    return {
      id: row.id,
      name: row.name,
      tier: verified ? "full" : "basic",
      canReceiveLeads: verified,
      address: row.address,
      postalCode: row.postal_code,
      city: row.city,
      location: row.lat !== null && row.lng !== null ? { lat: row.lat, lng: row.lng } : null,
      phone: row.phone,
      website: row.website,
      openingHours: this.openingHours(row.opening_hours),
      trustpilot: trustpilotFromColumns(row),
      logoUrl: row.logo_path
        ? PublicMediaStorage.publicUrl(row.logo_path, row.logo_updated_at ? Date.parse(row.logo_updated_at) : undefined)
        : null,
      prices: this.prices(row.prices),
    };
  }

  private profileToDto(row: PublicProfileRow): PublicClinicProfileRecord {
    const dentists = this.parseJson(publicDentistsJsonSchema, row.dentists, "dentists") ?? [];
    return {
      ...this.toDto(row),
      description: row.description,
      email: row.email,
      allPrices: this.prices(row.all_prices),
      dentists: dentists.map((dentist) => ({
        id: dentist.id,
        fullName: dentist.full_name,
        title: dentist.title,
        bio: dentist.bio,
        photoUrl: dentist.photo_path
          ? PublicMediaStorage.publicUrl(dentist.photo_path, dentist.photo_updated_at ? Date.parse(dentist.photo_updated_at) : undefined)
          : null,
        portfolio: dentist.portfolio.map((item) => ({
          id: item.id,
          imageUrl: PublicMediaStorage.publicUrl(item.image_path),
          caption: item.caption,
          serviceName: item.service_name,
        })),
      })),
    };
  }

  // Alle synlige klinikker, eller kun `clinicIds` (ukendte og usynlige udelades). `serviceIds`: de behandlinger, priserne
  // skal vises for (kun verificerede klinikker har priser).
  async listClinics(serviceIds: readonly string[] = [], clinicIds: readonly string[] | null = null): Promise<PublicClinicRecord[]> {
    const rows = await this.rpc<PublicClinicRow[]>("public_clinics", {
      p_service_ids: [...serviceIds],
      p_clinic_ids: clinicIds ? [...clinicIds] : null,
    });
    return this.toDtos(rows);
  }

  // Én synlig klinik, eller null (ukendt, `registered` eller `removed`).
  async findClinic(clinicId: string, serviceIds: readonly string[] = []): Promise<PublicClinicRecord | null> {
    const rows = await this.rpc<PublicClinicRow[]>("public_clinics", {
      p_service_ids: [...serviceIds],
      p_clinic_ids: [clinicId],
    });
    return rows?.[0] ? this.toDto(rows[0]) : null;
  }

  // Profilen for én synlig klinik, eller null. Basisniveau har ingen beskrivelse, e-mail, priser eller tandlæger.
  async findProfile(clinicId: string, serviceIds: readonly string[] = []): Promise<PublicClinicProfileRecord | null> {
    const rows = await this.rpc<PublicProfileRow[]>("public_clinic_profile", {
      p_clinic_id: clinicId,
      p_service_ids: [...serviceIds],
    });
    return rows?.[0] ? this.profileToDto(rows[0]) : null;
  }

  // Postnummerets midtpunkt til afstandsberegning (gemmes ikke), eller null for et ukendt postnummer.
  async findPostalCodeLocation(postalCode: string): Promise<{ lat: number; lng: number } | null> {
    const row = await this.run<{ lat: number; lng: number }>(
      this.db.from("postal_codes").select("lat, lng").eq("postal_code", postalCode).maybeSingle(),
      "postal_codes: select fejlede",
    );
    return row ? { lat: row.lat, lng: row.lng } : null;
  }
}
