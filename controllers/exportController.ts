import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PatientExportDto } from "@/lib/types/patients";
import type { Session } from "@/middleware/session";
import { CasesRepository } from "@/models/casesRepository";
import { ConsentsRepository } from "@/models/consentsRepository";

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type ExportDeps = { cases: CasesRepository; consents: ConsentsRepository };

// GDPR art. 15/20 (architecture 10.2). Læser med brugerens JWT, så RLS afgør, hvad der kan læses: kun egne data.
// Chatten (ai_conversations/ai_messages) hører til trin 2.
export class ExportController {
  private readonly cases: CasesRepository;
  private readonly consents: ConsentsRepository;

  constructor(
    supabase: SupabaseClient,
    protected readonly session: Session,
    deps: Partial<ExportDeps> = {},
  ) {
    this.cases = deps.cases ?? new CasesRepository(supabase);
    this.consents = deps.consents ?? new ConsentsRepository(supabase);
  }

  async exportOwnData(): Promise<PatientExportDto> {
    const [cases, consents] = await Promise.all([this.cases.listOwnForExport(), this.consents.listOwn()]);
    return { exportedAt: new Date().toISOString(), cases, consents };
  }
}
