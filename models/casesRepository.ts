import "server-only";
import { CASE_ACTIVE_LEAD_STATUSES } from "@/lib/constants/cases";
import { parseAiSummary } from "@/lib/schemas/aiSummary";
import type { CaseConversationInfo, CaseExportDto, CaseLeadStatus, CaseRecordDto } from "@/lib/types/cases";
import { notDraft, notFound } from "@/middleware/http";
import { BaseRepository } from "@/models/base/baseRepository";
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

// Rækken i sagslisten: sagen, ydelsernes navne og leadsene (uden klinikkens navn, som kommer i trin 4).
type CaseListRow = CaseRow & {
  case_services: { services: { name: string } | null }[] | null;
  leads: { id: string; status: CaseLeadStatus }[] | null;
};

// Sager (architecture 4.3). Brugerens JWT, så RLS afgør, at kun ejeren ser sagen. Kun `deleteDraft` kræver service
// role-klienten (2.3 c: der er ingen DELETE-policy på cases), og kalderen har da tjekket ejer og kladde først.
export class CasesRepository extends BaseRepository<CaseRow, CaseRecordDto> {
  protected toDto(row: CaseRow): CaseRecordDto {
    return {
      id: row.id,
      status: row.status,
      isEmergency: row.is_emergency,
      postalCode: row.postal_code,
      preferredTimeframe: row.preferred_timeframe,
      // jsonb: parses med zod; ugyldigt indhold bliver til null (architecture 2.1.1).
      aiSummary: parseAiSummary(row.ai_summary),
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

  // Egen sag. RLS skjuler andres sager, så "findes ikke" og "ikke din" giver begge null (404, architecture 2.4).
  async findOwn(caseId: string): Promise<CaseRecordDto | null> {
    const row = await this.run(
      this.db.from("cases").select(CASE_COLUMNS).eq("id", caseId).maybeSingle(),
      "cases: select fejlede",
    );
    return row ? this.toDto(row) : null;
  }

  async requireOwn(caseId: string): Promise<CaseRecordDto> {
    return this.requireRow(await this.findOwn(caseId));
  }

  // Egen sag, der stadig er en kladde: 404 for andres sager, 409 NOT_DRAFT for sendte og lukkede sager. Alle
  // controllere, der ændrer en kladde, bruger denne (ét sted).
  async requireOwnDraft(caseId: string): Promise<CaseRecordDto> {
    const record = await this.requireOwn(caseId);
    if (record.status !== "draft") throw notDraft();
    return record;
  }

  // Redigerer kladden (postnummer, tidsrum). Databasen afviser alt andet (kolonne-grants og cases_guard, 5.1).
  // En tom patch returnerer sagen uændret.
  async update(
    caseId: string,
    patch: { postalCode?: string; preferredTimeframe?: CaseRecordDto["preferredTimeframe"] },
  ): Promise<CaseRecordDto> {
    const row = await this.patchRow(
      patch,
      { postalCode: "postal_code", preferredTimeframe: "preferred_timeframe" },
      {
        update: (columns) =>
          this.db.from("cases").update(columns).eq("id", caseId).eq("status", "draft").select(CASE_COLUMNS).maybeSingle(),
        current: () => this.db.from("cases").select(CASE_COLUMNS).eq("id", caseId).maybeSingle(),
      },
      "cases: update fejlede",
    );
    return this.toDto(row);
  }

  // close_case() (security definer): trækker åbne leads tilbage og lukker sagen. Idempotent (architecture 5.3).
  async close(caseId: string): Promise<void> {
    await this.rpc("close_case", { p_case_id: caseId }, { NOT_FOUND: notFound() });
  }

  // Sletter en kladde. Kun med service role-klienten, og kun efter at kalderen har tjekket ejer og kladde. Betingelsen
  // `status = 'draft'` gælder også i selve sletningen: returnerer false, hvis sagen imellemtiden er sendt (L4).
  async deleteDraft(caseId: string): Promise<boolean> {
    const rows = await this.runList<{ id: string }>(
      this.db.from("cases").delete().eq("id", caseId).eq("status", "draft").select("id"),
      "cases: delete fejlede",
    );
    return rows.length > 0;
  }

  // Antal aktive leads på sagen (sendt, accepteret eller booket). Patienten ser egne leads (RLS).
  async countActiveLeads(caseId: string): Promise<number> {
    const rows = await this.runList<{ status: CaseLeadStatus }>(
      this.db.from("leads").select("status").eq("case_id", caseId),
      "leads: select fejlede",
    );
    return rows.filter((row) => (CASE_ACTIVE_LEAD_STATUSES as readonly string[]).includes(row.status)).length;
  }

  // Om sagen har en AI-samtale, og de ydelser, AI'en senest foreslog (kun id'er; kataloget slås op af controlleren).
  async findConversationInfo(caseId: string): Promise<CaseConversationInfo> {
    const conversation = await this.run<{ id: string }>(
      this.db.from("ai_conversations").select("id").eq("case_id", caseId).maybeSingle(),
      "ai_conversations: select fejlede",
    );
    if (!conversation) return { hasConversation: false, suggestedServiceIds: [] };
    const messages = await this.runList<{ suggested_service_ids: string[] }>(
      this.db
        .from("ai_messages")
        .select("suggested_service_ids")
        .eq("conversation_id", conversation.id)
        .eq("role", "assistant")
        .order("created_at", { ascending: false })
        .limit(20),
      "ai_messages: select fejlede",
    );
    const latest = messages.find((m) => m.suggested_service_ids.length > 0);
    return { hasConversation: true, suggestedServiceIds: latest?.suggested_service_ids ?? [] };
  }

  // Oversigten over egne sager (nyeste først). Leadsene har endnu ikke klinikkens navn (kommer med trin 4).
  async listOwnForList(): Promise<
    {
      record: CaseRecordDto;
      serviceNames: string[];
      leads: { id: string; status: CaseLeadStatus }[];
    }[]
  > {
    const rows = await this.runList<CaseListRow>(
      this.db
        .from("cases")
        .select(`${CASE_COLUMNS}, case_services(services(name)), leads(id, status)`)
        .order("created_at", { ascending: false }),
      "cases: list fejlede",
    );
    return rows.map((row) => ({
      record: this.toDto(row),
      serviceNames: (row.case_services ?? []).flatMap((cs) => (cs.services ? [cs.services.name] : [])),
      leads: row.leads ?? [],
    }));
  }
}
