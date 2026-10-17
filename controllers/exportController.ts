import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PatientExportDto } from "@/lib/types/patients";
import type { Session } from "@/middleware/session";
import { CasesRepository } from "@/models/casesRepository";
import { ChatRepository } from "@/models/chatRepository";
import { ConsentsRepository } from "@/models/consentsRepository";
import { LeadsRepository } from "@/models/leadsRepository";

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type ExportDeps = { cases: CasesRepository; consents: ConsentsRepository; chat: ChatRepository; leads: LeadsRepository };

// GDPR art. 15/20 (architecture 10.2). Læser med brugerens JWT, så RLS afgør, hvad der kan læses: kun egne data.
// Chatten (ai_conversations/ai_messages) og leads læses også med JWT: kun patientens egne.
export class ExportController {
  private readonly cases: CasesRepository;
  private readonly consents: ConsentsRepository;
  private readonly chat: ChatRepository;
  private readonly leads: LeadsRepository;

  constructor(
    supabase: SupabaseClient,
    protected readonly session: Session,
    deps: Partial<ExportDeps> = {},
  ) {
    this.cases = deps.cases ?? new CasesRepository(supabase);
    this.consents = deps.consents ?? new ConsentsRepository(supabase);
    this.chat = deps.chat ?? new ChatRepository(supabase);
    this.leads = deps.leads ?? new LeadsRepository(supabase);
  }

  async exportOwnData(): Promise<PatientExportDto> {
    const [cases, consents, chat, leads] = await Promise.all([
      this.cases.listOwnForExport(),
      this.consents.listOwn(),
      this.chat.listOwnForExport(),
      this.leads.listOwnForExport(),
    ]);
    return { exportedAt: new Date().toISOString(), cases, chat, leads, consents };
  }
}
