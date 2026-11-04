import "server-only";
import { ADMIN_EXCERPT_CHARS, ADMIN_LIST_LIMIT } from "@/lib/admin/constants/admin";
import type { AdminModerationItemDto, ModerationKind } from "@/lib/admin/types/admin";
import type { ModerationStatus, PriceAccuracy } from "@/lib/booking/types/reviews";
import { BaseRepository } from "@/platform/base/baseRepository";
import { iso, isoOrNull } from "@/platform/db/mappers";
import { notFound, reasonRequired } from "@/platform/middleware/http";

type Clinic = { id: string; name: string };
type ModerationFields = { id: string; created_at: string; moderation_status: ModerationStatus; rejection_reason: string | null; moderated_at: string | null; clinic: Clinic | null };
// patient_id og booking_id vælges aldrig (dataminimering, admin 3).
type ReviewRow = ModerationFields & {
  stars: number;
  text: string;
  price_accuracy: PriceAccuracy;
  actual_price: number | null;
  lacked_transparency: boolean | null;
  transparency_comment: string | null;
};
type ReplyRow = ModerationFields & { review_id: string; text: string; review: { text: string } | null };

const BASE = "id, created_at, moderation_status, rejection_reason, moderated_at, clinic:clinics(id, name)";
const REVIEW_COLUMNS = `${BASE}, stars, text, price_accuracy, actual_price, lacked_transparency, transparency_comment`;
const REPLY_COLUMNS = `${BASE}, review_id, text, review:reviews(text)`;

const excerpt = (text: string) => (text.length > ADMIN_EXCERPT_CHARS ? `${text.slice(0, ADMIN_EXCERPT_CHARS).trimEnd()}…` : text);

// Admins læsning og moderation af anmeldelser og klinikkers svar (admin 5.3, 10.14). Brugerens JWT: admin har SELECT på reviews og
// review_replies via is_admin(); skrivning sker kun gennem admin_moderate(), som selv tjekker rollen.
export class AdminModerationRepository extends BaseRepository<ReviewRow | ReplyRow, AdminModerationItemDto> {
  private base(row: ModerationFields) {
    return {
      id: row.id,
      clinic: row.clinic ?? { id: "", name: "" },
      createdAt: iso(row.created_at),
      moderationStatus: row.moderation_status,
      rejectionReason: row.rejection_reason,
      moderatedAt: isoOrNull(row.moderated_at),
    };
  }

  private reviewDto(row: ReviewRow): AdminModerationItemDto {
    return {
      ...this.base(row),
      kind: "review",
      stars: row.stars,
      text: row.text,
      priceAccuracy: row.price_accuracy,
      actualPrice: row.actual_price,
      lackedTransparency: row.lacked_transparency,
      transparencyComment: row.transparency_comment,
    };
  }

  private replyDto(row: ReplyRow): AdminModerationItemDto {
    return { ...this.base(row), kind: "reply", reviewId: row.review_id, text: row.text, reviewExcerpt: excerpt(row.review?.text ?? "") };
  }

  // Ældste først, højst 200.
  async list(kind: ModerationKind, status: ModerationStatus): Promise<AdminModerationItemDto[]> {
    if (kind === "review") {
      const rows = await this.runList<ReviewRow>(
        this.db.from("reviews").select(REVIEW_COLUMNS).eq("moderation_status", status).order("created_at").order("id").limit(ADMIN_LIST_LIMIT),
        "reviews: select fejlede",
      );
      return rows.map((row) => this.reviewDto(row));
    }
    const rows = await this.runList<ReplyRow>(
      this.db.from("review_replies").select(REPLY_COLUMNS).eq("moderation_status", status).order("created_at").order("id").limit(ADMIN_LIST_LIMIT),
      "review_replies: select fejlede",
    );
    return rows.map((row) => this.replyDto(row));
  }

  async require(kind: ModerationKind, id: string): Promise<AdminModerationItemDto> {
    if (kind === "review") {
      const row = await this.run<ReviewRow>(this.db.from("reviews").select(REVIEW_COLUMNS).eq("id", id).maybeSingle(), "reviews: select fejlede");
      return this.reviewDto(this.requireRow(row));
    }
    const row = await this.run<ReplyRow>(this.db.from("review_replies").select(REPLY_COLUMNS).eq("id", id).maybeSingle(), "review_replies: select fejlede");
    return this.replyDto(this.requireRow(row));
  }

  // Godkend eller afvis. 404 for ukendt id, 400 REASON_REQUIRED for en afvisning uden begrundelse.
  async moderate(kind: ModerationKind, id: string, status: "approved" | "rejected", reason: string | null): Promise<void> {
    await this.rpc(
      "admin_moderate",
      { p_kind: kind, p_id: id, p_status: status, p_reason: reason },
      { NOT_FOUND: notFound(), REASON_REQUIRED: reasonRequired() },
    );
  }
}
