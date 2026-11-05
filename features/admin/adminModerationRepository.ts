import "server-only";
import { ADMIN_EXCERPT_CHARS, ADMIN_LIST_LIMIT } from "@/lib/admin/constants/admin";
import type { AdminModerationItemDto, ModerationKind } from "@/lib/admin/types/admin";
import type { ModerationStatus } from "@/lib/booking/types/reviews";
import { BaseRepository } from "@/platform/base/baseRepository";
import type { Database } from "@/platform/db/database.types";
import { iso, isoOrNull } from "@/platform/db/mappers";
import { notFound, reasonRequired } from "@/platform/middleware/http";

// Rækkerne fra admin_reviews() og admin_review_replies() (migration 20261110000200), udledt af de genererede typer. Funktionerne
// returnerer aldrig patient_id, booking_id eller patientens navn, så de kan ikke nå DTO'erne (dataminimering, admin 3).
type Functions = Database["public"]["Functions"];
type ReviewRow = Functions["admin_reviews"]["Returns"][number];
type ReplyRow = Functions["admin_review_replies"]["Returns"][number];
type ModerationFields = ReviewRow | ReplyRow;

const excerpt = (text: string) => (text.length > ADMIN_EXCERPT_CHARS ? `${text.slice(0, ADMIN_EXCERPT_CHARS).trimEnd()}…` : text);

// Admins læsning og moderation af anmeldelser og klinikkers svar (admin 5.3, 10.14). Brugerens JWT. Admin har ingen direkte
// SELECT på reviews og review_replies (M1, migration 20261110000200): læsning går gennem admin_reviews() og
// admin_review_replies(), og skrivning gennem admin_moderate(); alle tjekker selv rollen.
export class AdminModerationRepository extends BaseRepository<ReviewRow | ReplyRow, AdminModerationItemDto> {
  private base(row: ModerationFields) {
    return {
      id: row.id,
      clinic: { id: row.clinic_id, name: row.clinic_name },
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
    return { ...this.base(row), kind: "reply", reviewId: row.review_id, text: row.text, reviewExcerpt: excerpt(row.review_text) };
  }

  // Ældste først, højst 200 (begge dele afgøres af funktionerne).
  async list(kind: ModerationKind, status: ModerationStatus): Promise<AdminModerationItemDto[]> {
    return this.fetch(kind, { p_status: status });
  }

  async require(kind: ModerationKind, id: string): Promise<AdminModerationItemDto> {
    return this.requireRow((await this.fetch(kind, { p_id: id }))[0]);
  }

  private async fetch(kind: ModerationKind, args: { p_status?: ModerationStatus; p_id?: string }): Promise<AdminModerationItemDto[]> {
    if (kind === "review") {
      const rows = await this.rpc<ReviewRow[]>("admin_reviews", args);
      return (rows ?? []).slice(0, ADMIN_LIST_LIMIT).map((row) => this.reviewDto(row));
    }
    const rows = await this.rpc<ReplyRow[]>("admin_review_replies", args);
    return (rows ?? []).slice(0, ADMIN_LIST_LIMIT).map((row) => this.replyDto(row));
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
