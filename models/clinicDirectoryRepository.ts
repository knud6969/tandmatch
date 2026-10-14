import "server-only";
import type { ZodType } from "zod";
import {
  publicDentistsJsonSchema,
  publicOpeningHoursJsonSchema,
  publicPricesJsonSchema,
} from "@/lib/schemas/clinics";
import type {
  ClinicPriceDto,
  OpeningHoursDto,
  PublicClinicProfileRecord,
  PublicClinicRecord,
} from "@/lib/types/clinics";
import type { PublicReviewDto, ReviewStats } from "@/lib/types/reviews";
import { BaseRepository } from "@/models/base/baseRepository";
import type { Database } from "@/models/db/database.types";
import { trustpilotFromColumns } from "@/models/db/mappers";
import { PublicMediaStorage } from "@/models/publicMediaStorage";

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
type WithNulls<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null };
type PublicClinicRow = WithNulls<Generated, NullableColumns>;
type PublicProfileRow = WithNulls<GeneratedProfile, NullableColumns | "description" | "email">;

type StatsRow = WithNulls<
  Functions["public_clinic_review_stats_many"]["Returns"][number],
  "avg_stars" | "as_quoted_count" | "slightly_higher_count" | "much_higher_count" | "price_accuracy_pct"
>;
type ReviewRow = WithNulls<
  Functions["public_reviews"]["Returns"][number],
  "actual_price" | "lacked_transparency" | "transparency_comment" | "reply_text" | "reply_created_at"
>;

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

  // Alle synlige klinikker. `serviceIds`: de behandlinger, priserne skal vises for (kun verificerede klinikker har priser).
  async listClinics(serviceIds: readonly string[] = []): Promise<PublicClinicRecord[]> {
    const rows = await this.rpc<PublicClinicRow[]>("public_clinics", { p_service_ids: [...serviceIds], p_clinic_ids: null });
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

  // Anmeldelsesstatistik beregnet i databasen (architecture 8.3). Kun verificerede klinikker har en række.
  async reviewStats(clinicIds: readonly string[]): Promise<Map<string, ReviewStats>> {
    const result = new Map<string, ReviewStats>();
    if (clinicIds.length === 0) return result;
    const rows = await this.rpc<StatsRow[]>("public_clinic_review_stats_many", { p_clinic_ids: [...clinicIds] });
    for (const row of rows ?? []) {
      result.set(row.clinic_id, {
        reviewCount: row.review_count,
        avgStars: row.avg_stars,
        priceAccuracyPct: row.price_accuracy_pct,
        distribution:
          row.as_quoted_count === null || row.slightly_higher_count === null || row.much_higher_count === null
            ? null
            : { asQuoted: row.as_quoted_count, slightlyHigher: row.slightly_higher_count, muchHigher: row.much_higher_count },
      });
    }
    return result;
  }

  // Godkendte anmeldelser og godkendte svar, nyeste først. Anmelderen vises ikke (architecture 8.1).
  async listReviews(clinicId: string): Promise<PublicReviewDto[]> {
    const rows = (await this.rpc<ReviewRow[]>("public_reviews", { p_clinic_id: clinicId })) ?? [];
    return rows.map((row) => ({
      id: row.review_id,
      stars: row.stars,
      text: row.text,
      priceAccuracy: row.price_accuracy,
      actualPrice: row.actual_price,
      lackedTransparency: row.lacked_transparency,
      transparencyComment: row.transparency_comment,
      verifiedVisit: true,
      createdMonth: row.created_month,
      reply: row.reply_text && row.reply_created_at ? { text: row.reply_text, createdAt: row.reply_created_at } : null,
    }));
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
