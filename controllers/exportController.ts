import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConsentDto } from "@/lib/types/consents";
import { listConsents } from "@/models/consentsModel";

// Dataeksport for egen konto (GDPR art. 15/20). Kun egne data; RLS afgør hvad der kan læses.
// MIDLERTIDIGT (0.9): kun samtykker. Sager, leads, bookinger og anmeldelser tilføjes i 0.10, når deres repositories findes.
type PatientExportDto = {
  exportedAt: string;
  consents: ConsentDto[];
};

export async function exportOwnData(supabase: SupabaseClient): Promise<PatientExportDto> {
  return { exportedAt: new Date().toISOString(), consents: await listConsents(supabase) };
}
