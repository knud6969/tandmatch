import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { toClinicDate } from "@/lib/common/domain/time";
import type { createReviewSchema, replyReviewSchema } from "@/lib/schemas/reviews";
import type { ClinicReviewDto, OwnReviewDto, ReviewCreatedDto, ReviewEligibleItemDto } from "@/lib/types/reviews";
import { alreadyReplied, notFound } from "@/platform/middleware/http";
import type { Session } from "@/platform/middleware/session";
import { BookingsRepository } from "@/models/bookingsRepository";
import { ClinicsRepository } from "@/features/clinics/clinicsRepository";
import { LeadsRepository } from "@/features/leads/leadsRepository";
import { ReviewsRepository } from "@/models/reviewsRepository";

type CreateReviewInput = z.infer<typeof createReviewSchema>;
type ReplyInput = z.infer<typeof replyReviewSchema>;

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type ReviewsDeps = {
  reviews: ReviewsRepository;
  bookings: BookingsRepository;
  leads: LeadsRepository;
  clinics: ClinicsRepository;
};

// Anmeldelser og klinikkens svar (architecture 8, 10.13). Patienten anmelder et gennemført besøg (effektivt `completed`,
// 24 timer efter sluttid, hos en verificeret klinik) én gang pr. booking; klinikken svarer én gang på en godkendt anmeldelse.
// Reglerne håndhæves af RLS-policyerne og unique-nøglerne; nye anmeldelser og svar er `pending`, til de godkendes manuelt
// i databasen (8.5). Klinikken udledes af bookingen i databasen og kan ikke angives. Offentlig læsning ligger i
// ClinicDirectoryController (10.7).
export class ReviewsController {
  private readonly reviews: ReviewsRepository;
  private readonly bookings: BookingsRepository;
  private readonly leads: LeadsRepository;
  private readonly clinics: ClinicsRepository;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
    deps: Partial<ReviewsDeps> = {},
  ) {
    this.reviews = deps.reviews ?? new ReviewsRepository(supabase);
    this.bookings = deps.bookings ?? new BookingsRepository(supabase);
    this.leads = deps.leads ?? new LeadsRepository(supabase);
    this.clinics = deps.clinics ?? new ClinicsRepository(supabase);
  }

  // ---- Patienten ----

  // Gennemførte besøg, der endnu ikke er anmeldt, med prisoverslaget (præciseret pris, ellers listepris, 8.2).
  async eligible(): Promise<{ items: ReviewEligibleItemDto[] }> {
    const due = (await this.bookings.listForPatient()).filter((booking) => booking.canReview);
    const estimates = await this.leads.priceEstimates(due.map((booking) => booking.leadId));
    return {
      items: due.map((booking) => ({
        bookingId: booking.id,
        clinicId: booking.clinic.id,
        clinicName: booking.clinic.name,
        serviceName: booking.service.name,
        visitedOn: toClinicDate(booking.startsAt),
        priceEstimate: estimates.get(booking.leadId) ?? null,
      })),
    };
  }

  // Opretter en anmeldelse. 403 REVIEW_NOT_ALLOWED (ikke egen, ikke gennemført, udeblevet, aflyst eller ikke-verificeret
  // klinik), 409 ALREADY_REVIEWED, 404 for en ukendt booking.
  async create(input: CreateReviewInput): Promise<ReviewCreatedDto> {
    return this.reviews.create(input);
  }

  // Egne anmeldelser med moderationsstatus og evt. afvisningsgrund.
  async mine(): Promise<{ reviews: OwnReviewDto[] }> {
    const bookings = await this.bookings.listForPatient();
    const clinics = new Map(bookings.map((booking) => [booking.id, { id: booking.clinic.id, name: booking.clinic.name }]));
    return { reviews: await this.reviews.listOwn(clinics) };
  }

  // ---- Klinikken ----

  // Klinikkens godkendte anmeldelser med eget svar og dets status. Kun for verificerede klinikker (403 CLINIC_NOT_VERIFIED).
  async listForClinic(): Promise<{ reviews: ClinicReviewDto[] }> {
    await this.clinics.requireOwnVerified(this.session.userId);
    return { reviews: await this.reviews.listForClinic() };
  }

  // Svarer på en godkendt anmeldelse af egen klinik. 404 for en anmeldelse, klinikken ikke kan se (fremmed, ikke godkendt
  // eller ukendt), 409 ALREADY_REPLIED.
  async reply(reviewId: string, input: ReplyInput): Promise<ReviewCreatedDto> {
    await this.clinics.requireOwnVerified(this.session.userId);
    const review = (await this.reviews.listForClinic()).find((candidate) => candidate.id === reviewId);
    if (!review) throw notFound();
    if (review.reply) throw alreadyReplied();
    return this.reviews.createReply(reviewId, input.text);
  }

}
