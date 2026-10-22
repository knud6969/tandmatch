import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PatientExportDto } from "@/lib/identity/types/patients";
import type { Session } from "@/platform/middleware/session";
import { BookingsRepository } from "@/features/booking";
import { CasesRepository } from "@/features/cases";
import { ChatRepository } from "@/features/cases";
import { ConsentsRepository } from "@/features/identity/consentsRepository";
import { LeadsRepository } from "@/features/leads";
import { ReviewsRepository } from "@/features/booking";

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type ExportDeps = { cases: CasesRepository; consents: ConsentsRepository; chat: ChatRepository; leads: LeadsRepository; bookings: BookingsRepository; reviews: ReviewsRepository };

// GDPR art. 15/20 (architecture 10.2). Læser med brugerens JWT, så RLS afgør, hvad der kan læses: kun egne data.
// Chatten (ai_conversations/ai_messages), leads, bookinger og anmeldelser læses også med JWT: kun patientens egne.
export class ExportController {
  private readonly cases: CasesRepository;
  private readonly consents: ConsentsRepository;
  private readonly chat: ChatRepository;
  private readonly leads: LeadsRepository;
  private readonly bookings: BookingsRepository;
  private readonly reviews: ReviewsRepository;

  constructor(
    supabase: SupabaseClient,
    protected readonly session: Session,
    deps: Partial<ExportDeps> = {},
  ) {
    this.cases = deps.cases ?? new CasesRepository(supabase);
    this.consents = deps.consents ?? new ConsentsRepository(supabase);
    this.chat = deps.chat ?? new ChatRepository(supabase);
    this.leads = deps.leads ?? new LeadsRepository(supabase);
    this.bookings = deps.bookings ?? new BookingsRepository(supabase);
    this.reviews = deps.reviews ?? new ReviewsRepository(supabase);
  }

  async exportOwnData(): Promise<PatientExportDto> {
    const [cases, consents, chat, leads, bookings, reviews] = await Promise.all([
      this.cases.listOwnForExport(),
      this.consents.listOwn(),
      this.chat.listOwnForExport(),
      this.leads.listOwnForExport(),
      this.bookings.listOwnForExport(),
      this.reviews.listOwnForExport(),
    ]);
    return { exportedAt: new Date().toISOString(), cases, chat, leads, bookings, reviews, consents };
  }
}
