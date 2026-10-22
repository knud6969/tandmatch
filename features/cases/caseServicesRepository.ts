import "server-only";
import { ApiError } from "@/platform/middleware/http";
import { BaseRepository } from "@/platform/base/baseRepository";
import type { Tables } from "@/platform/db/database.types";

type CaseServiceRow = Pick<Tables<"case_services">, "service_id" | "suggested_by_ai">;

export type CaseServiceRecord = { serviceId: string; suggestedByAi: boolean };

// Bekræftede ydelser på en sag (architecture 4.3 `case_services`). Brugerens JWT: RLS kræver ejer og kladde, og
// triggeren afviser den sjette ydelse (SERVICE_LIMIT). Katalogtjekket (aktiv ydelse) gør controlleren først.
export class CaseServicesRepository extends BaseRepository<CaseServiceRow, CaseServiceRecord> {
  protected toDto(row: CaseServiceRow): CaseServiceRecord {
    return { serviceId: row.service_id, suggestedByAi: row.suggested_by_ai };
  }

  async listForCase(caseId: string): Promise<CaseServiceRecord[]> {
    return this.toDtos(
      await this.runList(
        this.db
          .from("case_services")
          .select("service_id, suggested_by_ai")
          .eq("case_id", caseId)
          .order("confirmed_at", { ascending: true }),
        "case_services: select fejlede",
      ),
    );
  }

  // Gør sagens ydelser lig med `desired`: kun forskellene skrives (fjernede eller ændrede slettes, nye eller ændrede
  // indsættes), så en uændret ydelse beholder sit bekræftelsestidspunkt, og en fejl ikke efterlader en tom liste.
  async replace(caseId: string, desired: readonly CaseServiceRecord[]): Promise<void> {
    const current = new Map((await this.listForCase(caseId)).map((r) => [r.serviceId, r.suggestedByAi]));
    const wanted = new Map(desired.map((r) => [r.serviceId, r.suggestedByAi]));

    const remove = [...current].filter(([id, ai]) => wanted.get(id) !== ai).map(([id]) => id);
    const add = desired.filter((r) => current.get(r.serviceId) !== r.suggestedByAi);

    if (remove.length > 0) {
      await this.run(
        this.db.from("case_services").delete().eq("case_id", caseId).in("service_id", remove),
        "case_services: delete fejlede",
      );
    }
    if (add.length > 0) {
      await this.run(
        this.db
          .from("case_services")
          .insert(add.map((r) => ({ case_id: caseId, service_id: r.serviceId, suggested_by_ai: r.suggestedByAi }))),
        "case_services: insert fejlede",
        { SERVICE_LIMIT: new ApiError(400, "SERVICE_LIMIT", "Du kan højst vælge 5 behandlinger.") },
      );
    }
  }
}
