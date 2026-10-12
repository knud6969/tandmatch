import "server-only";
import { BaseRepository } from "@/models/base/baseRepository";
import type { CaseExportDto, CaseRecordDto } from "@/lib/types/cases";
import type { Tables } from "@/models/db/database.types";

type CaseRow = Pick<
  Tables<"cases">,
  | "id"
  | "status"
  | "is_emergency"
  | "postal_code"
  | "preferred_timeframe"
  | "ai_summary"
  | "summary_text"
  | "summary_ai_assisted"
  | "summary_approved_at"
  | "submitted_at"
  | "closed_at"
  | "created_at"
>;

type CaseExportRow = CaseRow & {
  case_services: Pick<Tables<"case_services">, "service_id" | "suggested_by_ai" | "confirmed_at">[] | null;
  case_images: Pick<Tables<"case_images">, "id" | "ai_view" | "ai_quality" | "ai_description" | "created_at">[] | null;
};

const CASE_COLUMNS =
  "id, status, is_emergency, postal_code, preferred_timeframe, ai_summary, summary_text, summary_ai_assisted, " +
  "summary_approved_at, submitted_at, closed_at, created_at";

// Sager (architecture 4.3). Brugerens JWT, så RLS afgør, at kun ejeren ser sagen. Udvides i trin 2.
export class CasesRepository extends BaseRepository<CaseRow, CaseRecordDto> {
  protected toDto(row: CaseRow): CaseRecordDto {
    return {
      id: row.id,
      status: row.status,
      isEmergency: row.is_emergency,
      postalCode: row.postal_code,
      preferredTimeframe: row.preferred_timeframe,
      aiSummary: row.ai_summary,
      summaryText: row.summary_text,
      summaryAiAssisted: row.summary_ai_assisted,
      summaryApprovedAt: row.summary_approved_at,
      submittedAt: row.submitted_at,
      closedAt: row.closed_at,
      createdAt: row.created_at,
    };
  }

  // Opretter en tom kladde. Triggeren afviser en ekstra kladde for anonyme (DRAFT_LIMIT).
  async create(patientId: string): Promise<CaseRecordDto> {
    const row = await this.run(
      this.db.from("cases").insert({ patient_id: patientId }).select(CASE_COLUMNS).single(),
      "cases: insert fejlede",
    );
    return this.toDto(this.requireRow(row));
  }

  // Seneste egen kladde (anonyme har højst én). Bruges til retry-sikker oprettelse af anonym session.
  async findLatestDraft(): Promise<CaseRecordDto | null> {
    const row = await this.run(
      this.db
        .from("cases")
        .select(CASE_COLUMNS)
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "cases: select fejlede",
    );
    return row ? this.toDto(row) : null;
  }

  // Alle egne sager med ydelser og billedmetadata til dataeksporten.
  async listOwnForExport(): Promise<CaseExportDto[]> {
    const rows = await this.runList<CaseExportRow>(
      this.db
        .from("cases")
        .select(
          `${CASE_COLUMNS}, case_services(service_id, suggested_by_ai, confirmed_at), ` +
            "case_images(id, ai_view, ai_quality, ai_description, created_at)",
        )
        .order("created_at", { ascending: true }),
      "cases: eksport fejlede",
    );
    return rows.map((row) => ({
      ...this.toDto(row),
      services: (row.case_services ?? []).map((s) => ({
        serviceId: s.service_id,
        suggestedByAi: s.suggested_by_ai,
        confirmedAt: s.confirmed_at,
      })),
      images: (row.case_images ?? []).map((i) => ({
        id: i.id,
        view: i.ai_view,
        quality: i.ai_quality,
        description: i.ai_description,
        createdAt: i.created_at,
      })),
    }));
  }
}
