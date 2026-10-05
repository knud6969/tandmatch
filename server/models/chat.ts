import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OutOfScopeTopic } from "@/lib/types/ai";

export type ConversationRecord = {
  id: string;
  status: "active" | "closed";
  userMessageCount: number;
  aiConsentId: string;
};

export type MessageRecord = {
  id: string;
  role: "user" | "assistant";
  content: string;
  outOfScopeTopics: OutOfScopeTopic[];
  blocked: boolean;
  readyForSummary: boolean;
  createdAt: string;
};

type ConversationRow = {
  id: string;
  status: "active" | "closed";
  user_message_count: number;
  ai_consent_id: string;
};

type MessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  out_of_scope: OutOfScopeTopic[];
  blocked: boolean;
  ready_for_summary: boolean;
  created_at: string;
};

const CONVERSATION_COLUMNS = "id, status, user_message_count, ai_consent_id";
const MESSAGE_COLUMNS = "id, role, content, out_of_scope, blocked, ready_for_summary, created_at";

function toConversation(row: ConversationRow): ConversationRecord {
  return {
    id: row.id,
    status: row.status,
    userMessageCount: row.user_message_count,
    aiConsentId: row.ai_consent_id,
  };
}

function toMessage(row: MessageRow): MessageRecord {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    outOfScopeTopics: row.out_of_scope ?? [],
    blocked: row.blocked,
    readyForSummary: row.ready_for_summary,
    createdAt: row.created_at,
  };
}

export async function getConversation(
  supabase: SupabaseClient,
  requestId: string,
): Promise<ConversationRecord | null> {
  const { data, error } = await supabase
    .from("ai_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("request_id", requestId)
    .maybeSingle();
  if (error) throw new Error("ai_conversations: select fejlede");
  return data ? toConversation(data as unknown as ConversationRow) : null;
}

export async function createConversation(
  supabase: SupabaseClient,
  params: { requestId: string; patientId: string; aiConsentId: string },
): Promise<ConversationRecord> {
  const { data, error } = await supabase
    .from("ai_conversations")
    .insert({
      request_id: params.requestId,
      patient_id: params.patientId,
      ai_consent_id: params.aiConsentId,
    })
    .select(CONVERSATION_COLUMNS)
    .single();
  if (error || !data) throw new Error("ai_conversations: insert fejlede");
  return toConversation(data as unknown as ConversationRow);
}

export async function listMessages(
  supabase: SupabaseClient,
  conversationId: string,
  limit?: number,
): Promise<MessageRecord[]> {
  let query = supabase
    .from("ai_messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (limit !== undefined) {
    // Seneste n beskeder: hentes i omvendt rækkefølge og vendes om.
    query = query.order("created_at", { ascending: false }).limit(limit);
  }
  const { data, error } = await query;
  if (error) throw new Error("ai_messages: list fejlede");
  const rows = (data as unknown as MessageRow[]).map(toMessage);
  return limit !== undefined ? rows.reverse() : rows;
}

export async function insertMessage(
  supabase: SupabaseClient,
  params: {
    conversationId: string;
    patientId: string;
    role: "user" | "assistant";
    content: string;
    outOfScopeTopics: OutOfScopeTopic[];
    blocked: boolean;
    readyForSummary: boolean;
  },
): Promise<MessageRecord> {
  const { data, error } = await supabase
    .from("ai_messages")
    .insert({
      conversation_id: params.conversationId,
      patient_id: params.patientId,
      role: params.role,
      content: params.content,
      out_of_scope: params.outOfScopeTopics,
      blocked: params.blocked,
      ready_for_summary: params.readyForSummary,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error || !data) throw new Error("ai_messages: insert fejlede");
  return toMessage(data as unknown as MessageRow);
}

// Antal patientbeskeder de seneste 24 timer (security definer i databasen, se migration 120500).
export async function countUserMessagesLastDay(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("patient_user_messages_last_day");
  if (error || typeof data !== "number") throw new Error("patient_user_messages_last_day fejlede");
  return data;
}

// Dagligt loft for AI-kald fra anonyme sessioner (7.6). Returnerer true, hvis kaldet må køre.
export async function tryConsumeAnonymousAiCall(supabase: SupabaseClient, cap: number): Promise<boolean> {
  const { data, error } = await supabase.rpc("try_consume_anonymous_ai_call", { p_cap: cap });
  if (error) throw new Error("try_consume_anonymous_ai_call fejlede");
  return data === true;
}
