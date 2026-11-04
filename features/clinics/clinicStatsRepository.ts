import "server-only";
import type { ClinicStatsRow } from "@/lib/clinics/types/stats";
import { BaseRepository } from "@/platform/base/baseRepository";
import { clinicNotVerified } from "@/platform/middleware/http";

// Klinikkens statistik (clinics 10.18): ét kald til clinic_stats(), som kun tæller den kaldende ejers egen klinik.
// Brugerens JWT; ingen klinik-id sendes, så en klinik aldrig kan bede om en andens tal.
export class ClinicStatsRepository extends BaseRepository {
  async get(from: Date, to: Date): Promise<ClinicStatsRow> {
    const rows = await this.rpc<ClinicStatsRow[]>(
      "clinic_stats",
      { p_from: from.toISOString(), p_to: to.toISOString() },
      { CLINIC_NOT_VERIFIED: clinicNotVerified() },
    );
    return this.requireRow(rows?.[0]);
  }
}
