import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaseExportDto } from "@/lib/types/cases";
import type { ConsentDto } from "@/lib/types/consents";
import { CasesRepository } from "@/models/casesRepository";
import { ConsentsRepository } from "@/models/consentsRepository";

// GDPR art. 15/20 (architecture 10.2): { exportedAt, cases, leads, bookings, reviews, consents }.
// Kun egne data; RLS afgør hvad der kan læses.
// [IKKE BYGGET] leads (trin 4), bookings (trin 6) og reviews (trin 6) tilføjes, når deres repositories findes.
// Chatten (ai_conversations/ai_messages) hører til trin 2.
export type PatientExportDto = {
  exportedAt: string;
  cases: CaseExportDto[];
  consents: ConsentDto[];
};

export class ExportController {
  private readonly cases: CasesRepository;
  private readonly consents: ConsentsRepository;

  constructor(supabase: SupabaseClient) {
    this.cases = new CasesRepository(supabase);
    this.consents = new ConsentsRepository(supabase);
  }

  async exportOwnData(): Promise<PatientExportDto> {
    const [cases, consents] = await Promise.all([this.cases.listOwnForExport(), this.consents.listOwn()]);
    return { exportedAt: new Date().toISOString(), cases, consents };
  }
}
