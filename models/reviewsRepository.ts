import "server-only";
import type { z } from "zod";
import { toClinicMonth } from "@/lib/common/domain/time";
import type { createReviewSchema } from "@/lib/schemas/reviews";
import type {
  ClinicReviewDto,
  ModerationStatus,
  OwnReviewDto,
  PriceAccuracy,
  PublicReviewDto,
  ReviewCreatedDto,
  ReviewExportDto,
  ReviewStats,
} from "@/lib/types/reviews";
import type { ApiError } from "@/platform/middleware/http";
import { alreadyReplied, alreadyReviewed, notFound, reviewNotAllowed } from "@/platform/middleware/http";
import { BaseRepository } from "@/platform/base/baseRepository";
import type { Database } from "@/platform/db/database.types";
import { iso, type WithNulls } from "@/platform/db/mappers";

type CreateReviewInput = z.infer<typeof createReviewSchema>;
type Functions = Database["public"]["Functions"];

// De genererede typer for `returns table` markerer ikke nullable kolonner; de er angivet her.
type StatsRow = WithNulls<
  Functions["public_clinic_review_stats_many"]["Returns"][number],
  "avg_stars" | "as_quoted_count" | "slightly_higher_count" | "much_higher_count" | "price_accuracy_pct"
>;
type PublicReviewRow = WithNulls<
  Functions["public_reviews"]["Returns"][number],
  "actual_price" | "lacked_transparency" | "transparency_comment" | "reply_text" | "reply_created_at"
>;
type ClinicReviewRow = WithNulls<
  Functions["clinic_reviews"]["Returns"][number],
  "actual_price" | "lacked_transparency" | "transparency_comment" | "reply_id" | "reply_text" | "reply_created_at" | "reply_status"
>;

// Felterne, en anmeldelse har uanset hvor den læses fra (tabellen, public_reviews() eller clinic_reviews()).
type ReviewFields = {
  stars: number;
  text: string;
  price_accuracy: PriceAccuracy;
  actual_price: number | null;
  lacked_transparency: boolean | null;
  transparency_comment: string | null;
  created_at: string;
};

// Patientens egen anmeldelse, som tabellen giver den (RLS: patient_id = uid).
type OwnReviewRow = ReviewFields & {
  id: string;
  booking_id: string;
  clinic_id: string;
  moderation_status: ModerationStatus;
  rejection_reason: string | null;
};

type CreatedRow = { id: string; moderation_status: ModerationStatus };

const OWN_COLUMNS =
  "id, booking_id, clinic_id, stars, text, price_accuracy, actual_price, lacked_transparency, transparency_comment, " +
  "moderation_status, rejection_reason, created_at";

// Fejl fra insert i reviews (RLS-policyen og triggeren, architecture 8.1). Teksterne står kun her.
const CREATE_ERRORS = (): Record<string, ApiError> => ({
  NOT_FOUND: notFound(),
  // Booking uden for patientens ret: ikke egen, ikke gennemført (24 t efter sluttid), udeblevet, aflyst eller klinikken er ikke verificeret.
  "row-level security": reviewNotAllowed(),
  reviews_booking_id_key: alreadyReviewed(),
});

// Fejl fra insert i review_replies (policyen kræver egen, godkendt anmeldelse; unik pr. anmeldelse).
const REPLY_ERRORS = (): Record<string, ApiError> => ({
  NOT_FOUND: notFound(),
  "row-level security": notFound(),
  review_replies_review_id_key: alreadyReplied(),
});

// Anmeldelser og svar (architecture 4.3, 8, 10.7, 10.13). Brugerens JWT, så RLS afgør adgangen: patienten skriver og læser
// sine egne anmeldelser direkte; klinikken læser kun gennem clinic_reviews() og svarer kun på egne, godkendte anmeldelser;
// den offentlige læsning går gennem public_reviews() og public_clinic_review_stats_many() (kun verificerede klinikker).
// Rækkerne mappes direkte til DTO'erne, så toDto() i basisklassen ikke bruges.
export class ReviewsRepository extends BaseRepository {
  // Fælles felter i alle anmeldelses-DTO'er. Anmelderen vises aldrig; måneden beregnes i dansk tid (10.13).
  private base(row: ReviewFields): Omit<PublicReviewDto, "id" | "reply"> {
    return {
      stars: row.stars,
      text: row.text,
      priceAccuracy: row.price_accuracy,
      actualPrice: row.actual_price,
      lackedTransparency: row.lacked_transparency,
      transparencyComment: row.transparency_comment,
      verifiedVisit: true,
      createdMonth: toClinicMonth(row.created_at),
    };
  }

  // ---- Offentlig læsning (architecture 10.7) ----

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

  private async publicRows(clinicId: string): Promise<PublicReviewRow[]> {
    return (await this.rpc<PublicReviewRow[]>("public_reviews", { p_clinic_id: clinicId })) ?? [];
  }

  // Godkendte anmeldelser og godkendte svar, nyeste først. Anmelderen vises ikke (architecture 8.1).
  async listPublic(clinicId: string): Promise<PublicReviewDto[]> {
    return (await this.publicRows(clinicId)).map((row) => ({
      id: row.review_id,
      ...this.base(row),
      reply: row.reply_text && row.reply_created_at ? { text: row.reply_text, createdAt: row.reply_created_at } : null,
    }));
  }

  // ---- Patienten ----

  // Opretter en anmeldelse. Klinik og patient udledes af bookingen i triggeren, og anmeldelsen er altid `pending` (8.5).
  // RLS-policyen (can_review_booking) afgør, om bookingen må anmeldes (403), unique(booking_id) giver 409.
  async create(input: CreateReviewInput): Promise<ReviewCreatedDto> {
    const row = await this.run<CreatedRow>(
      this.db
        .from("reviews")
        .insert({
          booking_id: input.bookingId,
          stars: input.stars,
          text: input.text,
          price_accuracy: input.priceAccuracy,
          actual_price: input.actualPrice ?? null,
          lacked_transparency: input.lackedTransparency ?? null,
          transparency_comment: input.transparencyComment ?? null,
        })
        .select("id, moderation_status")
        .single(),
      "reviews: insert fejlede",
      CREATE_ERRORS(),
    );
    const created = this.requireRow(row);
    return { id: created.id, moderationStatus: created.moderation_status };
  }

  private async ownRows(): Promise<OwnReviewRow[]> {
    return this.runList<OwnReviewRow>(
      this.db.from("reviews").select(OWN_COLUMNS).order("created_at", { ascending: false }),
      "reviews: select fejlede",
    );
  }

  // Patientens egne anmeldelser, nyeste først, med moderationsstatus. `clinics` er klinikken pr. booking-id (fra
  // patient_bookings()); patienten kan ikke læse clinics direkte. Klinikkens svar følger med, når det er godkendt
  // (review_replies er ikke læsbar for patienten, så det hentes fra public_reviews()).
  async listOwn(clinics: ReadonlyMap<string, { id: string; name: string }>): Promise<OwnReviewDto[]> {
    const rows = await this.ownRows();
    const clinicIds = [...new Set(rows.filter((row) => row.moderation_status === "approved").map((row) => row.clinic_id))];
    const replies = new Map<string, { text: string; createdAt: string }>();
    const publicRows = await Promise.all(clinicIds.map((clinicId) => this.publicRows(clinicId)));
    for (const row of publicRows.flat()) {
      if (row.reply_text && row.reply_created_at) replies.set(row.review_id, { text: row.reply_text, createdAt: row.reply_created_at });
    }
    // En anmeldelse hører altid til en af patientens bookinger; ses den ikke i `clinics`, springes den over i stedet for
    // at vise et tomt klinikfelt.
    return rows.flatMap((row) => {
      const clinic = clinics.get(row.booking_id);
      if (!clinic) return [];
      return [
        {
          id: row.id,
          ...this.base(row),
          reply: row.moderation_status === "approved" ? (replies.get(row.id) ?? null) : null,
          bookingId: row.booking_id,
          clinic,
          moderationStatus: row.moderation_status,
          rejectionReason: row.rejection_reason,
        },
      ];
    });
  }

  // Alle patientens anmeldelser til dataeksporten.
  async listOwnForExport(): Promise<ReviewExportDto[]> {
    return (await this.ownRows()).map((row) => ({
      id: row.id,
      bookingId: row.booking_id,
      clinicId: row.clinic_id,
      stars: row.stars,
      text: row.text,
      priceAccuracy: row.price_accuracy,
      actualPrice: row.actual_price,
      lackedTransparency: row.lacked_transparency,
      transparencyComment: row.transparency_comment,
      moderationStatus: row.moderation_status,
      rejectionReason: row.rejection_reason,
      createdAt: iso(row.created_at),
    }));
  }

  // ---- Klinikken ----

  // Godkendte anmeldelser af egen klinik med eget svar og dets status (også ikke-godkendte svar), nyeste først.
  async listForClinic(): Promise<ClinicReviewDto[]> {
    const rows = (await this.rpc<ClinicReviewRow[]>("clinic_reviews", undefined)) ?? [];
    return rows.map((row) => ({
      id: row.review_id,
      ...this.base(row),
      reply: row.reply_text && row.reply_created_at ? { text: row.reply_text, createdAt: row.reply_created_at } : null,
      replyStatus: row.reply_status,
    }));
  }

  // Klinikkens svar på en anmeldelse. Triggeren sætter klinik og `pending`; policyen kræver, at anmeldelsen er egen og godkendt.
  async createReply(reviewId: string, text: string): Promise<ReviewCreatedDto> {
    const row = await this.run<CreatedRow>(
      this.db.from("review_replies").insert({ review_id: reviewId, text }).select("id, moderation_status").single(),
      "review_replies: insert fejlede",
      REPLY_ERRORS(),
    );
    const created = this.requireRow(row);
    return { id: created.id, moderationStatus: created.moderation_status };
  }
}
