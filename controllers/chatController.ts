import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { CHAT_CONTEXT_MESSAGES, CHAT_MAX_DAILY_PER_PATIENT, CHAT_MAX_USER_MESSAGES_PER_CONVERSATION } from "@/lib/constants/limits";
import type { chatMessageSchema } from "@/lib/schemas/chat";
import type { AiChatMessageDto, AiConversationRecord, AiMessageRecord, ChatStateDto, ChatTurnResponse } from "@/lib/types/ai";
import type { ServiceDto, ServiceGroupDto } from "@/lib/types/services";
import { ApiError, aiUnavailable, consentRequired, notDraft } from "@/middleware/http";
import type { Session } from "@/middleware/session";
import { CaseImagesRepository } from "@/models/caseImagesRepository";
import { CasesRepository } from "@/models/casesRepository";
import { ChatRepository } from "@/models/chatRepository";
import { ConsentsRepository } from "@/models/consentsRepository";
import { lazyAdminClient } from "@/models/db/admin";
import { ServicesRepository } from "@/models/servicesRepository";
import { isAiUpstreamError } from "@/services/ai/errors";
import { AiChatService } from "@/services/ai/aiChatService";
import { createAiClient } from "@/services/ai/openai";
import { AI_RULES } from "@/services/ai/rules";
import { AiImageService } from "@/services/aiImageService";

type ChatMessageInput = z.infer<typeof chatMessageSchema>;

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type ChatDeps = {
  cases: CasesRepository;
  consents: ConsentsRepository;
  chat: ChatRepository;
  services: ServicesRepository;
  images: CaseImagesRepository;
  imageLoader: AiImageService;
  ai: AiChatService;
  admin: () => SupabaseClient;
};

function flatten(groups: ServiceGroupDto[]): ServiceDto[] {
  return groups.flatMap((group) => group.services);
}

// AI-chatten på en sag (architecture 7, 10.6). Controlleren kender hverken prompts eller OpenAI: det gør AiChatService.
// Læsning og patientens egne beskeder sker med brugerens JWT (RLS). Service role bruges kun til assistentens svar og
// det anonyme døgnloft (2.3 a, b), efter ejer-, kladde-, samtykke- og lofttjek.
export class ChatController {
  private readonly cases: CasesRepository;
  private readonly consents: ConsentsRepository;
  private readonly chat: ChatRepository;
  private readonly services: ServicesRepository;
  private readonly images: CaseImagesRepository;
  private readonly imageLoader: AiImageService;
  private readonly ai: AiChatService;
  private readonly admin: () => SupabaseClient;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
    deps: Partial<ChatDeps> = {},
  ) {
    this.admin = deps.admin ?? lazyAdminClient();
    this.cases = deps.cases ?? new CasesRepository(supabase);
    this.consents = deps.consents ?? new ConsentsRepository(supabase);
    this.chat = deps.chat ?? new ChatRepository(supabase);
    this.services = deps.services ?? new ServicesRepository(supabase);
    this.images = deps.images ?? new CaseImagesRepository(supabase);
    this.imageLoader = deps.imageLoader ?? new AiImageService(this.admin);
    this.ai = deps.ai ?? new AiChatService(createAiClient(), AI_RULES);
  }

  private toMessageDto(record: AiMessageRecord, byId: Map<string, ServiceDto>): AiChatMessageDto {
    return {
      id: record.id,
      role: record.role,
      content: record.content,
      preliminaryAssessment: record.preliminaryAssessment,
      suggestedServices: record.suggestedServiceIds.flatMap((id) => {
        const service = byId.get(id);
        return service ? [service] : [];
      }),
      emergency: record.emergency,
      outOfScopeTopics: record.outOfScopeTopics,
      blocked: record.blocked,
      createdAt: record.createdAt,
    };
  }

  private messagesLeft(conversation: AiConversationRecord | null, extra = 0): number {
    const used = (conversation?.userMessageCount ?? 0) + extra;
    return conversation?.status === "closed" ? 0 : Math.max(0, CHAT_MAX_USER_MESSAGES_PER_CONVERSATION - used);
  }

  // Samtalen så langt (kan læses, også når sagen er sendt eller lukket).
  async getState(caseId: string): Promise<ChatStateDto> {
    await this.cases.requireOwn(caseId);
    const conversation = await this.chat.findConversation(caseId);
    if (!conversation) {
      return { conversationId: null, status: "active", messages: [], messagesLeft: CHAT_MAX_USER_MESSAGES_PER_CONVERSATION, readyForSummary: false };
    }
    const records = await this.chat.listMessages(conversation.id);
    const ids = records.flatMap((r) => r.suggestedServiceIds);
    const byId = new Map((await this.services.findActive(ids)).map((s) => [s.id, s]));
    const latestAssistant = [...records].reverse().find((r) => r.role === "assistant");
    return {
      conversationId: conversation.id,
      status: conversation.status,
      messages: records.map((r) => this.toMessageDto(r, byId)),
      messagesLeft: this.messagesLeft(conversation),
      readyForSummary: latestAssistant?.readyForSummary ?? false,
    };
  }

  // Én tur: patientens besked ind, assistentens validerede svar ud (architecture 10.6).
  async sendMessage(caseId: string, input: ChatMessageInput): Promise<ChatTurnResponse> {
    const record = await this.cases.requireOwn(caseId);
    if (record.status !== "draft") throw notDraft();

    // AI-samtykket er en forudsætning (vilkårs-accept giver det ikke, architecture 7.1).
    const consent = await this.consents.findActive("ai_processing");
    if (!consent) throw consentRequired("Du skal give samtykke til AI-behandling, før du kan chatte.");

    const conversation =
      (await this.chat.findConversation(caseId)) ??
      (await this.chat.createConversation({
        caseId,
        patientId: this.session.userId,
        consentId: consent.id,
        promptVersion: `${this.ai.promptVersion}+${this.ai.rulesVersion}`,
        model: this.ai.model,
      }));

    // Lofter (7.6) tjekkes før modelkaldet. Databasen håndhæver dem igen ved indsættelsen.
    if (conversation.status !== "active" || conversation.userMessageCount >= CHAT_MAX_USER_MESSAGES_PER_CONVERSATION) {
      throw new ApiError(429, "CHAT_LIMIT", "Du har nået grænsen for antal beskeder i samtalen.");
    }
    if ((await this.chat.countUserMessagesLastDay()) >= CHAT_MAX_DAILY_PER_PATIENT) {
      throw new ApiError(429, "RATE_LIMITED", "Du har sendt mange beskeder i dag. Prøv igen i morgen.");
    }
    // 2.3 (b): det fælles døgnloft for anonyme forbruges kun med service role. Funktionen tager bruger-id'et som argument.
    if (this.session.isAnonymous && !(await new ChatRepository(this.admin()).tryConsumeAnonymousAiCall(this.session.userId))) {
      throw new ApiError(429, "ANON_CAP_REACHED", "AI-assistenten er optaget lige nu. Opret en konto eller prøv igen senere.");
    }

    const catalog = await this.services.listGroups();
    const history = (await this.chat.listRecentMessages(conversation.id, CHAT_CONTEXT_MESSAGES - 1)).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const images = await this.loadImages(caseId);

    let result;
    try {
      result = await this.ai.sendTurn({ history, userMessage: input.message, catalog, images });
    } catch (err) {
      if (isAiUpstreamError(err)) throw aiUnavailable();
      throw err;
    }

    // Rækkefølgen: først patientens (maskerede) besked, så svaret. Svaret er allerede valideret og filtreret af guard.
    const userMessage = await this.chat.insertUserMessage({
      conversationId: conversation.id,
      patientId: this.session.userId,
      content: result.maskedUserMessage,
    });
    const slugToId = new Map(flatten(catalog).map((s) => [s.slug, s.id]));
    const suggestedIds = result.suggestedServices.flatMap((slug) => {
      const id = slugToId.get(slug);
      return id ? [id] : [];
    });
    // 2.3 (a): assistentens svar skrives kun med service role.
    const assistant = await new ChatRepository(this.admin()).appendAssistantMessage(this.session.userId, {
      conversationId: conversation.id,
      content: result.reply,
      preliminaryAssessment: result.preliminaryAssessment,
      suggestedServiceIds: suggestedIds,
      emergency: result.emergency,
      outOfScopeTopics: result.outOfScopeTopics,
      blocked: result.blocked,
      readyForSummary: result.readyForSummary,
    });

    const byId = new Map(flatten(catalog).map((s) => [s.id, s]));
    return {
      userMessage: this.toMessageDto(userMessage, byId),
      assistantMessage: this.toMessageDto(assistant, byId),
      outOfScopeNotice: result.outOfScopeTopics.length > 0,
      emergency: result.emergency,
      readyForSummary: result.readyForSummary,
      messagesLeft: this.messagesLeft(conversation, 1),
    };
  }

  // Billeder sendes kun til AI'en med aktivt image_upload-samtykke (9.4), re-encodet og som base64.
  private async loadImages(caseId: string) {
    if (!(await this.consents.hasActive("image_upload"))) return [];
    return this.imageLoader.load(await this.images.listForCase(caseId));
  }
}
