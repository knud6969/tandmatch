import "server-only";
import { BaseRepository } from "@/models/base/baseRepository";
import type { Tables } from "@/models/db/database.types";

type IdRow = Pick<Tables<"profiles">, "id">;

// Læsninger til oprydning og kontosletning. Bruges kun med admin-klienten (architecture 2.3 f, g).
// Ingen persondata logges herfra.
export class CleanupRepository extends BaseRepository<IdRow, string> {
  protected toDto(row: IdRow): string {
    return row.id;
  }

  async listExpiredAnonymousUserIds(cutoffIso: string, limit: number): Promise<string[]> {
    return this.toDtos(
      await this.runList<IdRow>(
        this.db.from("profiles").select("id").eq("is_anonymous", true).lt("last_active_at", cutoffIso).limit(limit),
        "profiles: udløbne sessioner kunne ikke læses",
      ),
    );
  }

  // Billedstien er {case_id}/{image_id}.jpg (ikke {patient_id}/...), så oprydning sker pr. sag.
  async listCaseIdsForPatient(patientId: string): Promise<string[]> {
    return this.toDtos(
      await this.runList<IdRow>(
        this.db.from("cases").select("id").eq("patient_id", patientId),
        "cases: kunne ikke læses til oprydning",
      ),
    );
  }
}
