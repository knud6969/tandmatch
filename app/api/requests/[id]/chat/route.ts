import { chatMessageSchema } from "@/lib/schemas/chat";
import {
  AI_TIMEOUT_MS,
  CHAT_CONTEXT_MESSAGES,
  CHAT_MAX_DAILY_PER_PATIENT,
  CHAT_MAX_USER_MESSAGES_PER_CONVERSATION,
} from "@/lib/constants/limits";
import { requireTerms } from "@/server/auth/terms";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { ApiError, jsonResponse, parseId, readJson, withApi } from "@/server/http/api";
import { requireOwnRequest } from "@/server/models/requests";
import { getLatestConsent } from "@/server/models/consents";
import {
  countUserMessagesLastDay,
  createConversation,
  getConversation,
  insertMessage,
  listMessages,
  tryConsumeAnonymousAiCall,
  type MessageRecord,
} from "@/server/models/chat";
import { AiTimeoutError, anonymousDailyCap, sendChatTurn } from "@/server/ai/chat";
import type { AiChatMessageDto, ChatStateDto } from "@/lib/types/requests";

type Ctx = { params: Promise<{ id: string }> };

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

// Chatten er kun for patienten (ejer). Tandlæger ser den aldrig (architecture 4.4, 5.5).
export const GET = withApi(async (_req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  const requestId = parseId((await ctx.params).id);
  const supabase = await createSupabaseServerClient();
  await requireOwnRequest(supabase, requestId, session.userId);

  const conversation = await getConversation(supabase, requestId);
  if (!conversation) {
    const empty: ChatStateDto = {
      conversationId: null,
      status: "active",
      messages: [],
      messagesLeft: CHAT_MAX_USER_MESSAGES_PER_CONVERSATION,
      readyForSummary: false,
    };
    return jsonResponse(empty);
  }

  const messages = await listMessages(supabase, conversation.id);
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const body: ChatStateDto = {
    conversationId: conversation.id,
    status: conversation.status,
    messages: messages.map(toDto),
    messagesLeft: Math.max(0, CHAT_MAX_USER_MESSAGES_PER_CONVERSATION - conversation.userMessageCount),
    readyForSummary: lastAssistant?.readyForSummary ?? false,
  };
  return jsonResponse(body);
});

// Én patientbesked og ét AI-svar. Ingen streaming: svaret vises først, når det er valideret (architecture 10.5).
export const POST = withApi(async (req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  const requestId = parseId((await ctx.params).id);
  const input = await readJson(req, chatMessageSchema);
  const supabase = await createSupabaseServerClient();

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
  if (session.isAnonymous && !(await tryConsumeAnonymousAiCall(supabase, anonymousDailyCap()))) {
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
      history: history.map((m) => ({ role: m.role, content: m.content })),
      userMessage: input.message,
    });
  } catch (err) {
    if (err instanceof AiTimeoutError) {
      throw new ApiError(503, "AI_TIMEOUT", `Svaret tog for lang tid (grænse ${AI_TIMEOUT_MS / 1000} sek.). Prøv igen.`);
    }
    throw err;
  }

  const userMessage = await insertMessage(supabase, {
    conversationId: conversation.id,
    patientId: session.userId,
    role: "user",
    content: input.message,
    outOfScopeTopics: [],
    blocked: false,
    readyForSummary: false,
  });
  const assistantMessage = await insertMessage(supabase, {
    conversationId: conversation.id,
    patientId: session.userId,
    role: "assistant",
    content: turn.reply,
    outOfScopeTopics: turn.outOfScopeTopics,
    blocked: turn.blocked,
    readyForSummary: turn.readyForSummary,
  });

  return jsonResponse(
    {
      userMessage: toDto(userMessage),
      assistantMessage: toDto(assistantMessage),
      outOfScopeNotice: turn.blocked || turn.outOfScopeTopics.length > 0,
      readyForSummary: turn.readyForSummary,
      messagesLeft: Math.max(0, CHAT_MAX_USER_MESSAGES_PER_CONVERSATION - (conversation.userMessageCount + 1)),
    },
    201,
  );
});
