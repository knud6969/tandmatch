import "server-only";
import type { AiConversationRecord, AiMessageRecord, ChatExportDto, OutOfScopeTopic } from "@/lib/types/ai";
import { ApiError, notFound } from "@/middleware/http";
import { BaseRepository } from "@/models/base/baseRepository";
import type { Tables } from "@/models/db/database.types";

type ConversationRow = Pick<
  Tables<"ai_conversations">,
  "id" | "case_id" | "status" | "user_message_count" | "prompt_version" | "model" | "created_at"
>;
type MessageRow = Pick<
  Tables<"ai_messages">,
  | "id"
  | "role"
  | "content"
  | "preliminary_assessment"
  | "suggested_service_ids"
  | "emergency"
  | "out_of_scope"
  | "blocked"
  | "ready_for_summary"
  | "created_at"
>;
type ExportRow = ConversationRow & { ai_messages: MessageRow[] | null };

const CONVERSATION_COLUMNS = "id, case_id, status, user_message_count, prompt_version, model, created_at";
const MESSAGE_COLUMNS =
  "id, role, content, preliminary_assessment, suggested_service_ids, emergency, out_of_scope, blocked, ready_for_summary, created_at";

export type NewAssistantMessage = {
  conversationId: string;
  content: string;
  preliminaryAssessment: string | null;
  suggestedServiceIds: string[];
  emergency: boolean;
  outOfScopeTopics: OutOfScopeTopic[];
  blocked: boolean;
  readyForSummary: boolean;
};

const chatLimit = () => new ApiError(429, "CHAT_LIMIT", "Samtalen er lukket eller har nået grænsen for antal beskeder.");

// AI-samtaler og -beskeder (architecture 4.3). Læsning og patientens egne beskeder sker med brugerens JWT (RLS: kun
// ejeren, samtykke og lofter håndhæves i databasen). `appendAssistantMessage` og `tryConsumeAnonymousAiCall` kan kun
// udføres af service role (2.3 a, b): kalderen gives admin-klienten og har tjekket ejer, kladde og samtykke først.
export class ChatRepository extends BaseRepository<MessageRow, AiMessageRecord> {
  protected toDto(row: MessageRow): AiMessageRecord {
    return {
      id: row.id,
      role: row.role,
      content: row.content,
      preliminaryAssessment: row.preliminary_assessment,
      suggestedServiceIds: row.suggested_service_ids ?? [],
      emergency: row.emergency,
      outOfScopeTopics: row.out_of_scope ?? [],
      blocked: row.blocked,
      readyForSummary: row.ready_for_summary,
      createdAt: row.created_at,
    };
  }

  private toConversation(row: ConversationRow): AiConversationRecord {
    return {
      id: row.id,
      caseId: row.case_id,
      status: row.status,
      userMessageCount: row.user_message_count,
      promptVersion: row.prompt_version,
      model: row.model,
      createdAt: row.created_at,
    };
  }

  async findConversation(caseId: string): Promise<AiConversationRecord | null> {
    const row = await this.run<ConversationRow>(
      this.db.from("ai_conversations").select(CONVERSATION_COLUMNS).eq("case_id", caseId).maybeSingle(),
      "ai_conversations: select fejlede",
    );
    return row ? this.toConversation(row) : null;
  }

  // Opretter samtalen (RLS: ejer, kladde og aktivt ai_processing-samtykke). Unik pr. sag.
  async createConversation(input: {
    caseId: string;
    patientId: string;
    consentId: string;
    promptVersion: string;
    model: string;
  }): Promise<AiConversationRecord> {
    const row = await this.run<ConversationRow>(
      this.db
        .from("ai_conversations")
        .insert({
          case_id: input.caseId,
          patient_id: input.patientId,
          ai_consent_id: input.consentId,
          prompt_version: input.promptVersion,
          model: input.model,
        })
        .select(CONVERSATION_COLUMNS)
        .single(),
      "ai_conversations: insert fejlede",
    );
    return this.toConversation(this.requireRow(row));
  }

  // De seneste beskeder, ældste først.
  async listRecentMessages(conversationId: string, limit: number): Promise<AiMessageRecord[]> {
    const rows = await this.runList<MessageRow>(
      this.db
        .from("ai_messages")
        .select(MESSAGE_COLUMNS)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(limit),
      "ai_messages: select fejlede",
    );
    return this.toDtos(rows).reverse();
  }

  // Alle beskeder (max 60: 30 brugerbeskeder og lige så mange svar), ældste først.
  async listMessages(conversationId: string): Promise<AiMessageRecord[]> {
    return this.toDtos(
      await this.runList<MessageRow>(
        this.db
          .from("ai_messages")
          .select(MESSAGE_COLUMNS)
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true }),
        "ai_messages: select fejlede",
      ),
    );
  }

  // Patientens besked (maskeret). RLS afviser, hvis samtalen er lukket, loftet er nået eller samtykket er trukket tilbage.
  async insertUserMessage(input: { conversationId: string; patientId: string; content: string }): Promise<AiMessageRecord> {
    const row = await this.run<MessageRow>(
      this.db
        .from("ai_messages")
        .insert({
          conversation_id: input.conversationId,
          patient_id: input.patientId,
          role: "user",
          content: input.content,
        })
        .select(MESSAGE_COLUMNS)
        .single(),
      "ai_messages: insert fejlede",
      { "row-level security": chatLimit() },
    );
    return this.toDto(this.requireRow(row));
  }

  // Patientens beskeder det seneste døgn (loft 100, architecture 7.6).
  async countUserMessagesLastDay(): Promise<number> {
    return (await this.rpc<number>("patient_user_messages_last_day", {})) ?? 0;
  }

  // Kun service role (2.3 a). Funktionen tjekker ejer, aktiv samtale og at ydelserne er aktive.
  async appendAssistantMessage(userId: string, message: NewAssistantMessage): Promise<AiMessageRecord> {
    const data = await this.rpc<MessageRow | MessageRow[]>(
      "append_assistant_message",
      {
        p_user_id: userId,
        p_conversation_id: message.conversationId,
        p_content: message.content,
        p_preliminary_assessment: message.preliminaryAssessment,
        p_suggested_service_ids: message.suggestedServiceIds,
        p_emergency: message.emergency,
        p_out_of_scope: message.outOfScopeTopics,
        p_blocked: message.blocked,
        p_ready: message.readyForSummary,
      },
      {
        NOT_FOUND: notFound(),
        CONVERSATION_CLOSED: chatLimit(),
        INVALID_SERVICE: new ApiError(400, "UNKNOWN_SERVICE", "En af behandlingerne findes ikke i kataloget."),
      },
    );
    const row = Array.isArray(data) ? data[0] : data;
    return this.toDto(this.requireRow(row));
  }

  // Kun service role (2.3 b). true, hvis den anonyme bruger er under døgnloftet (300 pr. døgn for alle anonyme).
  async tryConsumeAnonymousAiCall(userId: string): Promise<boolean> {
    return (await this.rpc<boolean>("try_consume_anonymous_ai_call", { p_user_id: userId })) === true;
  }

  // Egne samtaler med beskeder til dataeksporten (RLS: kun egne).
  async listOwnForExport(): Promise<ChatExportDto[]> {
    const rows = await this.runList<ExportRow>(
      this.db
        .from("ai_conversations")
        .select(`${CONVERSATION_COLUMNS}, ai_messages(${MESSAGE_COLUMNS})`)
        .order("created_at", { ascending: true }),
      "ai_conversations: eksport fejlede",
    );
    return rows.map((row) => ({
      caseId: row.case_id,
      status: row.status,
      userMessageCount: row.user_message_count,
      promptVersion: row.prompt_version,
      model: row.model,
      createdAt: row.created_at,
      messages: this.toDtos(row.ai_messages).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    }));
  }
}
