import "server-only";
import type { AiConversationRecord, AiMessageRecord, ChatExportDto, OutOfScopeTopic } from "@/lib/types/ai";
import { ApiError, aiConsentRequired, chatLimit, notDraft, notFound } from "@/middleware/http";
import { BaseRepository } from "@/models/base/baseRepository";
import type { Database, Tables } from "@/models/db/database.types";

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

// Udledt af den genererede funktionstype (npm run gen:types), så den følger databasen.
type ReservedTurnRow = Database["public"]["Functions"]["reserve_chat_turn"]["Returns"][number];

// Den reserverede tur: patientens (maskerede) besked er indsat, og lofterne er talt (reserve_chat_turn).
export type ReservedTurn = { message: AiMessageRecord; userMessageCount: number };

// AI-samtaler og -beskeder (architecture 4.3). Læsning sker med brugerens JWT (RLS: kun ejeren). `reserveTurn` og
// `appendAssistantMessage` kan kun udføres af service role (2.3 a): kalderen gives admin-klienten og sender den
// verificerede brugers id (efter IP-grænsen). Funktionerne tjekker selv ejer, kladde og samtykke for det id.
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
      // Samtidige første ture opretter samme samtale (unik pr. sag): kalderen læser den eksisterende.
      { "duplicate key": new ApiError(409, "CONVERSATION_EXISTS", "Samtalen findes allerede.") },
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

  // Kun service role (2.3 a). Reserverer en chat-tur FØR modelkaldet (architecture 7.6, H1): databasen låser patienten og samtalen, tjekker og
  // tæller lofterne (30 pr. samtale, døgnloft pr. patient, anonymt døgnloft pr. bruger og globalt) og indsætter patientens
  // maskerede besked i én transaktion. Samtidige kald kan derfor ikke tilsammen overskride et loft.
  async reserveTurn(userId: string, conversationId: string, maskedContent: string): Promise<ReservedTurn> {
    const data = await this.rpc<ReservedTurnRow[]>(
      "reserve_chat_turn",
      { p_user_id: userId, p_conversation_id: conversationId, p_content: maskedContent },
      {
        NOT_FOUND: notFound(),
        NOT_DRAFT: notDraft(),
        CONSENT_REQUIRED: aiConsentRequired(),
        CHAT_LIMIT: chatLimit(),
        RATE_LIMITED: new ApiError(429, "RATE_LIMITED", "Du har sendt mange beskeder i dag. Prøv igen i morgen."),
        ANON_USER_LIMIT: new ApiError(
          429,
          "RATE_LIMITED",
          "Du har sendt mange beskeder i dag. Opret en konto for at fortsætte, eller prøv igen i morgen.",
        ),
        ANON_CAP_REACHED: new ApiError(
          429,
          "ANON_CAP_REACHED",
          "AI-assistenten er optaget lige nu. Opret en konto eller prøv igen senere.",
        ),
      },
    );
    const row = this.requireRow(data?.[0]);
    return {
      message: {
        id: row.message_id,
        role: "user",
        content: row.message_content,
        preliminaryAssessment: null,
        suggestedServiceIds: [],
        emergency: false,
        outOfScopeTopics: [],
        blocked: false,
        readyForSummary: false,
        createdAt: row.message_created_at,
      },
      userMessageCount: row.user_message_count,
    };
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
        CONSENT_REQUIRED: aiConsentRequired(),
        INVALID_SERVICE: new ApiError(400, "UNKNOWN_SERVICE", "En af behandlingerne findes ikke i kataloget."),
      },
    );
    const row = Array.isArray(data) ? data[0] : data;
    return this.toDto(this.requireRow(row));
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
