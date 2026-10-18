import "server-only";
import { randomUUID } from "node:crypto";
import type { LeadStatus } from "@/lib/types/leads";
import type { MessageDto, MessageSenderRole } from "@/lib/types/messages";
import { isActiveLead } from "@/lib/domain/leads";
import { ApiError, messageLimit, threadClosed } from "@/middleware/http";
import { BaseRepository } from "@/models/base/baseRepository";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LeadsRepository } from "@/models/leadsRepository";

// Besked, som patienten læser den fra tabellen (RLS: kun sagens patient har SELECT).
type MessageRow = {
  id: string;
  sender_role: MessageSenderRole;
  body: string;
  created_at: string;
  read_at: string | null;
};
// Besked fra clinic_lead_messages(): aldrig sender_id (det er patientens id), kun om beskeden er klinikkens egen.
type ClinicMessageRow = { id: string; body: string; created_at: string; read_at: string | null; from_me: boolean };

const MESSAGE_COLUMNS = "id, sender_role, body, created_at, read_at";

// Beskedtråden pr. lead (architecture 4.3 `messages`, 5.3, 10.12). Patienten læser og skriver direkte med sin JWT (RLS);
// klinikken har ingen SELECT og går gennem clinic_lead_messages()/clinic_mark_messages_read(), som aldrig returnerer
// patientens id og intet for et tilbagetrukket lead. Afsenderrollen sættes af databasen (trigger), aldrig af klienten.
export class MessagesRepository extends BaseRepository<MessageRow> {
  private readonly leads: LeadsRepository;

  constructor(db: SupabaseClient) {
    super(db);
    this.leads = new LeadsRepository(db);
  }

  private fromPatientRow(row: MessageRow): MessageDto {
    return {
      id: row.id,
      fromMe: row.sender_role === "patient",
      senderRole: row.sender_role,
      body: row.body,
      createdAt: row.created_at,
      readAt: row.read_at,
    };
  }

  private fromClinicRow(row: ClinicMessageRow): MessageDto {
    return {
      id: row.id,
      fromMe: row.from_me,
      senderRole: row.from_me ? "clinic" : "patient",
      body: row.body,
      createdAt: row.created_at,
      readAt: row.read_at,
    };
  }

  // Trådens beskeder, ældste først. Tom liste for klinikken, hvis leadet er trukket tilbage.
  async list(role: MessageSenderRole, leadId: string): Promise<MessageDto[]> {
    if (role === "clinic") {
      const rows = await this.rpc<ClinicMessageRow[]>("clinic_lead_messages", { p_lead_id: leadId });
      return (rows ?? []).map((row) => this.fromClinicRow(row));
    }
    const rows = await this.runList<MessageRow>(
      this.db.from("messages").select(MESSAGE_COLUMNS).eq("lead_id", leadId).order("created_at").order("id"),
      "messages: select fejlede",
    );
    return rows.map((row) => this.fromPatientRow(row));
  }

  // Markerer modtagerens ulæste beskeder som læst (patienten: klinikkens; klinikken: patientens).
  async markRead(role: MessageSenderRole, leadId: string): Promise<void> {
    if (role === "clinic") {
      await this.rpc("clinic_mark_messages_read", { p_lead_id: leadId });
      return;
    }
    await this.run(
      this.db
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("lead_id", leadId)
        .eq("sender_role", "clinic")
        .is("read_at", null),
      "messages: update fejlede",
    );
  }

  // Antal ulæste beskeder fra patienten set fra klinikken, uden at hente tråden: tallet kommer fra clinic_leads(), som
  // tæller i databasen. Listen indsnævres til leadets status.
  async countUnreadForClinic(leadId: string, status: LeadStatus): Promise<number> {
    const rows = await this.rpc<{ lead_id: string; unread_messages: number | null }[]>("clinic_leads", { p_status: status });
    return rows?.find((row) => row.lead_id === leadId)?.unread_messages ?? 0;
  }

  // Antal beskeder brugeren har sendt de seneste 24 timer (samme tal som det loft, databasen håndhæver).
  async sentLastDay(): Promise<number> {
    return (await this.rpc<number>("participant_messages_last_day", {})) ?? 0;
  }

  // Indsætter en besked med brugerens JWT (RLS: deltager, permanent konto, åben tråd, døgnloft) og returnerer den.
  // Afvises indsættelsen af RLS, slås leadets status op igen: er tråden lukket, er svaret THREAD_CLOSED (tråden kan være
  // lukket mellem controllerens tjek og indsættelsen), ellers MESSAGE_LIMIT (døgnloftet nået mellem tjek og indsættelse).
  // Patienten får rækken direkte fra insert (kun MessageDto-kolonnerne). Klinikken har ingen SELECT på messages, så
  // insert kan ikke returnere rækken til den (et returning kræver en SELECT-policy); beskeden hentes via
  // clinic_lead_messages() ud fra det id, der er valgt her.
  async create(role: MessageSenderRole, leadId: string, senderId: string, body: string): Promise<MessageDto> {
    const id = randomUUID();
    const rejected = new ApiError(403, "RLS_REJECTED", "");
    try {
      if (role === "patient") {
        const row = await this.run<MessageRow>(
          this.db.from("messages").insert({ id, lead_id: leadId, sender_id: senderId, body }).select(MESSAGE_COLUMNS).single(),
          "messages: insert fejlede",
          { "row-level security": rejected },
        );
        return this.fromPatientRow(this.requireRow(row));
      }
      await this.run(this.db.from("messages").insert({ id, lead_id: leadId, sender_id: senderId, body }), "messages: insert fejlede", {
        "row-level security": rejected,
      });
    } catch (error) {
      if (error !== rejected) throw error;
      throw isActiveLead(await this.leads.requireStatus(leadId, role)) ? messageLimit() : threadClosed();
    }
    const created = (await this.list(role, leadId)).find((message) => message.id === id);
    return this.requireRow(created);
  }
}
