import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PatientExportDto } from "@/lib/identity/types/patients";
import type { Session } from "@/platform/middleware/session";
import { BookingsRepository } from "@/features/booking";
import { CasesRepository } from "@/features/cases";
import { ChatRepository } from "@/features/cases";
import { ConsentsRepository } from "@/features/identity/consentsRepository";
import { NotificationContactRepository } from "@/features/identity/notificationContactRepository";
import { PushTokensRepository } from "@/features/identity/pushTokensRepository";
import { FavoritesRepository } from "@/features/clinics";
import { LeadsRepository } from "@/features/leads";
import { ReviewsRepository } from "@/features/booking";

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type ExportDeps = { cases: CasesRepository; consents: ConsentsRepository; chat: ChatRepository; leads: LeadsRepository; bookings: BookingsRepository; reviews: ReviewsRepository; pushTokens: PushTokensRepository; favorites: FavoritesRepository; contact: NotificationContactRepository };

// GDPR art. 15/20 (architecture 10.2). Læser med brugerens JWT, så RLS afgør, hvad der kan læses: kun egne data.
// Chatten (ai_conversations/ai_messages), leads, bookinger og anmeldelser læses også med JWT: kun patientens egne.
export class ExportController {
  private readonly cases: CasesRepository;
  private readonly consents: ConsentsRepository;
  private readonly chat: ChatRepository;
  private readonly leads: LeadsRepository;
  private readonly bookings: BookingsRepository;
  private readonly reviews: ReviewsRepository;
  private readonly pushTokens: PushTokensRepository;
  private readonly favorites: FavoritesRepository;
  private readonly contact: NotificationContactRepository;

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
    this.pushTokens = deps.pushTokens ?? new PushTokensRepository(supabase);
    this.favorites = deps.favorites ?? new FavoritesRepository(supabase);
    this.contact = deps.contact ?? new NotificationContactRepository(supabase);
  }

  async exportOwnData(): Promise<PatientExportDto> {
    const [cases, consents, chat, leads, bookings, reviews, favorites, pushDevices, notificationContact] = await Promise.all([
      this.cases.listOwnForExport(),
      this.consents.listOwn(),
      this.chat.listOwnForExport(),
      this.leads.listOwnForExport(),
      this.bookings.listOwnForExport(),
      this.reviews.listOwnForExport(),
      this.favorites.listOwn(),
      this.pushTokens.listOwnForExport(),
      this.contact.listOwnForExport(),
    ]);
    return { exportedAt: new Date().toISOString(), cases, chat, leads, bookings, reviews, consents, favorites, pushDevices, notificationContact: notificationContact[0] ?? null };
  }
}
