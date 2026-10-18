import "server-only";
import { randomUUID } from "node:crypto";
import type { MessageDto, MessageSenderRole } from "@/lib/types/messages";
import { threadClosed } from "@/middleware/http";
import { BaseRepository } from "@/models/base/baseRepository";

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

  // Antal ulæste beskeder fra patienten set fra klinikken.
  async countUnreadForClinic(leadId: string): Promise<number> {
    return (await this.list("clinic", leadId)).filter((message) => !message.fromMe && message.readAt === null).length;
  }

  // Antal beskeder brugeren har sendt de seneste 24 timer (samme tal som det loft, databasen håndhæver).
  async sentLastDay(): Promise<number> {
    return (await this.rpc<number>("participant_messages_last_day", {})) ?? 0;
  }

  // Indsætter en besked med brugerens JWT (RLS: deltager, permanent konto, åben tråd, døgnloft). Id'et vælges her, fordi
  // klinikken ikke kan læse tabellen og dermed ikke kan få rækken tilbage fra insert; beskeden hentes bagefter via list().
  async create(leadId: string, senderId: string, body: string): Promise<string> {
    const id = randomUUID();
    await this.run(this.db.from("messages").insert({ id, lead_id: leadId, sender_id: senderId, body }), "messages: insert fejlede", {
      // Tråden blev lukket mellem controllerens tjek og indsættelsen.
      "row-level security": threadClosed(),
    });
    return id;
  }
}
