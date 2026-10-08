import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AI_TIMEOUT_MS,
  CHAT_CONTEXT_MESSAGES,
  CHAT_MAX_DAILY_PER_PATIENT,
  CHAT_MAX_USER_MESSAGES_PER_CONVERSATION,
} from "@/lib/constants/limits";
import type { AiChatMessageDto, ChatStateDto, ChatTurnResponse } from "@/lib/types/requests";
import { ApiError } from "@/middleware/http";
import type { Session } from "@/middleware/session";
import { createSupabaseAdminClient } from "@/models/db/admin";
import { requireOwnRequest } from "@/models/requestsModel";
import { getLatestConsent } from "@/models/consentsModel";
import {
  appendAssistantMessage,
  countUserMessagesLastDay,
  createConversation,
  getConversation,
  insertMessage,
  listMessages,
  tryConsumeAnonymousAiCall,
  type MessageRecord,
} from "@/models/chatModel";
import { AiInvalidOutputError, AiTimeoutError, AiUnavailableError, sendChatTurn } from "@/services/ai/chat";

// AI-chatten i wizarden. Kun for patienten (ejer). Tandlæger ser den aldrig (architecture 4.4, 5.5).

function toDto(message: MessageRecord): AiChatMessageDto {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    outOfScopeTopics: message.outOfScopeTopics,
    blocked: message.blocked,
    createdAt: message.createdAt,
  };
}

function messagesLeft(userMessageCount: number): number {
  return Math.max(0, CHAT_MAX_USER_MESSAGES_PER_CONVERSATION - userMessageCount);
}

export async function getChatState(
  supabase: SupabaseClient,
  session: Session,
  requestId: string,
): Promise<ChatStateDto> {
  await requireOwnRequest(supabase, requestId, session.userId);

  const conversation = await getConversation(supabase, requestId);
  if (!conversation) {
    return {
      conversationId: null,
      status: "active",
      messages: [],
      messagesLeft: CHAT_MAX_USER_MESSAGES_PER_CONVERSATION,
      readyForSummary: false,
    };
  }

  const messages = await listMessages(supabase, conversation.id);
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  return {
    conversationId: conversation.id,
    status: conversation.status,
    messages: messages.map(toDto),
    messagesLeft: messagesLeft(conversation.userMessageCount),
    readyForSummary: lastAssistant?.readyForSummary ?? false,
  };
}

// Én patientbesked og ét AI-svar. Ingen streaming: svaret vises først, når det er valideret (architecture 10.5).
export async function sendChatMessage(
  supabase: SupabaseClient,
  session: Session,
  requestId: string,
  message: string,
): Promise<ChatTurnResponse> {
  const record = await requireOwnRequest(supabase, requestId, session.userId);
  if (record.status !== "draft") {
    throw new ApiError(409, "NOT_DRAFT", "Forespørgslen er sendt. Chatten er lukket.");
  }

  const aiConsent = await getLatestConsent(supabase, "ai_processing");
  if (!aiConsent || aiConsent.withdrawnAt !== null) {
    throw new ApiError(403, "CONSENT_REQUIRED", "Du skal give samtykke til AI-behandling, før du kan chatte.");
  }

  let conversation = await getConversation(supabase, requestId);
  if (conversation && conversation.userMessageCount >= CHAT_MAX_USER_MESSAGES_PER_CONVERSATION) {
    throw new ApiError(429, "CHAT_LIMIT", "Samtalen har nået grænsen. Skriv din beskrivelse i stedet.");
  }
  if (conversation && conversation.status === "closed") {
    throw new ApiError(409, "CONVERSATION_CLOSED", "Samtalen er lukket.");
  }
  if ((await countUserMessagesLastDay(supabase)) >= CHAT_MAX_DAILY_PER_PATIENT) {
    throw new ApiError(429, "RATE_LIMITED", "Du har sendt mange beskeder i dag. Prøv igen i morgen.");
  }
  if (session.isAnonymous && !(await tryConsumeAnonymousAiCall(createSupabaseAdminClient()))) {
    throw new ApiError(429, "ANON_CAP_REACHED", "Chatten er travl lige nu. Opret en konto eller prøv igen senere.");
  }

  if (!conversation) {
    conversation = await createConversation(supabase, {
      requestId,
      patientId: session.userId,
      aiConsentId: aiConsent.id,
    });
  }

  const history = await listMessages(supabase, conversation.id, CHAT_CONTEXT_MESSAGES);
  let turn;
  try {
    turn = await sendChatTurn({
      category: record.category,
      answers: record.answers,
      history: history.map((m) => ({ role: m.role, content: m.content })),
      userMessage: message,
    });
  } catch (err) {
    if (err instanceof AiTimeoutError) {
      throw new ApiError(503, "AI_TIMEOUT", `Svaret tog for lang tid (grænse ${AI_TIMEOUT_MS / 1000} sek.). Prøv igen.`);
    }
    if (err instanceof AiUnavailableError || err instanceof AiInvalidOutputError) {
      throw new ApiError(503, "AI_UNAVAILABLE", "AI-assistenten er ikke tilgængelig lige nu. Prøv igen om lidt.");
    }
    throw err;
  }

  const userMessage = await insertMessage(supabase, {
    conversationId: conversation.id,
    patientId: session.userId,
    role: "user",
    content: turn.maskedUserMessage,
    outOfScopeTopics: [],
    blocked: false,
    readyForSummary: false,
  });
  // Assistentbeskeder skrives kun med service role (architecture 2.3).
  const assistantMessage = await appendAssistantMessage(createSupabaseAdminClient(), {
    conversationId: conversation.id,
    content: turn.reply,
    outOfScopeTopics: turn.outOfScopeTopics,
    blocked: turn.blocked,
    readyForSummary: turn.readyForSummary,
  });

  // En ny besked ændrer grundlaget for opsummeringen, så en tidligere godkendelse nulstilles. Det sker i
  // databasen i append_assistant_message() (migration 20261006120400), ikke her (architecture 7.1).
  return {
    userMessage: toDto(userMessage),
    assistantMessage: toDto(assistantMessage),
    outOfScopeNotice: turn.blocked || turn.outOfScopeTopics.length > 0,
    readyForSummary: turn.readyForSummary,
    messagesLeft: messagesLeft(conversation.userMessageCount + 1),
  };
}
