import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { CHAT_UNAVAILABLE_TEXT } from "@/lib/cases/constants/ai-texts";
import { CHAT_CONTEXT_MESSAGES, CHAT_MAX_USER_MESSAGES_PER_CONVERSATION } from "@/lib/common/constants/limits";
import type { chatMessageSchema } from "@/lib/cases/schemas/chat";
import type { AiChatMessageDto, AiConversationRecord, AiMessageRecord, ChatStateDto, ChatTurnResponse, ImageTurnResponse } from "@/lib/cases/types/ai";
import type { ServiceDto, ServiceGroupDto } from "@/lib/clinics/types/services";
import { AI_CONSENT_REQUIRED_MESSAGE, ApiError, aiUnavailable } from "@/platform/middleware/http";
import type { Session } from "@/platform/middleware/session";
import { CaseImagesRepository } from "@/features/cases/caseImagesRepository";
import { CasesRepository } from "@/features/cases/casesRepository";
import { ChatRepository, type ReservedTurn } from "@/features/cases/chatRepository";
import { ConsentsRepository } from "@/features/identity";
import { lazyAdminClient } from "@/platform/db/admin";
import { ServicesRepository } from "@/features/clinics";
import { AiChatService } from "@/features/cases/ai/aiChatService";
import { maskPii } from "@/features/cases/ai/pii";
import { createAiClient } from "@/features/cases/ai/openai";
import { AI_RULES } from "@/features/cases/ai/rules";
import { AiImageService } from "@/features/cases/aiImageService";

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
// Læsning sker med brugerens JWT. Service role bruges til reservationen af turen og til assistentens svar (2.3 a): begge
// funktioner kan kun udføres af service role, får den verificerede brugers id og tjekker selv ejer, kladde og samtykke.
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
      quickReplies: [], // gemmes ikke (7.9); answerTurn sætter dem på turens svar
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
    return {
      conversationId: conversation.id,
      status: conversation.status,
      messages: records.map((r) => this.toMessageDto(r, byId)),
      messagesLeft: this.messagesLeft(conversation),
      // 7.9a regel 2: klæbende, så kortet ikke forsvinder, når en senere tur uden flag kommer.
      readyForSummary: records.some((r) => r.role === "assistant" && r.readyForSummary),
    };
  }

  // Én tur: patientens besked ind, assistentens validerede svar ud (architecture 10.6).
  //
  // Turen RESERVERES før modelkaldet (H1): reserve_chat_turn() låser patienten og samtalen, tjekker og tæller lofterne og
  // indsætter patientens maskerede besked i én transaktion. Kun reserverede ture når modellen, så samtidige kald ikke
  // kan give flere modelkald end lofterne tillader. Fejler modellen (eller gemningen af svaret), gemmes en fast tekst
  // som svar, så turen ikke står ubesvaret i samtalen, og fejlen returneres.
  async sendMessage(caseId: string, input: ChatMessageInput): Promise<ChatTurnResponse> {
    await this.cases.requireOwnDraft(caseId);

    // AI-samtykket (nuværende tekstversion) er en forudsætning (vilkårs-accept giver det ikke, architecture 7.1).
    const consent = await this.consents.requireCurrentActive("ai_processing", AI_CONSENT_REQUIRED_MESSAGE);

    const conversation = await this.ensureConversation(caseId, consent.id);

    // Patientens tekst maskeres, før den gemmes (maskering er idempotent, så AI-laget kan maskere igen).
    // 2.3 (a): reservationen kan kun udføres af service role, og IP-grænsen er allerede talt i route.ts.
    const reserved = await new ChatRepository(this.admin()).reserveTurn(this.session.userId, conversation.id, maskPii(input.message));
    try {
      return await this.answerTurn(caseId, conversation.id, reserved);
    } catch (err) {
      await this.storeFixedAnswer(conversation.id);
      // Turen er gemt: ingen fejl herfra må se ud som en afvist besked.
      console.error("Chat-tur fejlede efter reservationen:", err instanceof Error ? err.name : "ukendt");
      throw aiUnavailable();
    }
  }

  // Samtalen på sagen; oprettes ved første tur (chat eller billedtur).
  private async ensureConversation(caseId: string, consentId: string): Promise<AiConversationRecord> {
    const existing = await this.chat.findConversation(caseId);
    if (existing) return existing;
    try {
      return await this.chat.createConversation({
        caseId,
        patientId: this.session.userId,
        consentId,
        promptVersion: `${this.ai.promptVersion}+${this.ai.rulesVersion}`,
        model: this.ai.model,
      });
    } catch (err) {
      // Et samtidigt kald oprettede samtalen først (unik pr. sag): brug den.
      if (!(err instanceof ApiError && err.code === "CONVERSATION_EXISTS")) throw err;
      const created = await this.chat.findConversation(caseId);
      if (!created) throw err;
      return created;
    }
  }

  // Billedtur (architecture 7.9c, 10.6): AI'en reagerer selv på nyuploadede billeder, uden patientbesked. Reserveres før
  // modelkaldet med reserve_image_turn() (ejer, kladde, begge samtykker, døgnloft, ét stempel pr. billede). Tæller ikke som
  // en patientbesked. Fejler noget efter reservationen, fortrydes stemplerne, og routen svarer 503, så turen kan gentages.
  async sendImageTurn(caseId: string): Promise<ImageTurnResponse> {
    await this.cases.requireOwnDraft(caseId);
    const consent = await this.consents.requireCurrentActive("ai_processing", AI_CONSENT_REQUIRED_MESSAGE);
    await this.consents.requireCurrentActive("image_upload", "Du skal give samtykke til billeder, før AI'en kan se dem.");
    const conversation = await this.ensureConversation(caseId, consent.id);

    const newImageIds = await new ChatRepository(this.admin()).reserveImageTurn(this.session.userId, conversation.id);
    try {
      const catalog = await this.services.listGroups();
      const history = (await this.chat.listRecentMessages(conversation.id, CHAT_CONTEXT_MESSAGES)).map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const images = await this.loadImages(caseId);
      const result = await this.ai.sendImageTurn({ history, catalog, images, newImageIds });

      // 2.3 (a, c): kvaliteten og svaret skrives med service role efter reservationen.
      const imagesWriter = new CaseImagesRepository(this.admin());
      for (const o of result.observations) await imagesWriter.saveTurnObservation(caseId, o.imageId, o);
      const slugToId = new Map(flatten(catalog).map((s) => [s.slug, s.id]));
      const assistant = await new ChatRepository(this.admin()).appendAssistantMessage(this.session.userId, {
        conversationId: conversation.id,
        content: result.reply,
        preliminaryAssessment: result.preliminaryAssessment,
        suggestedServiceIds: result.suggestedServices.flatMap((slug) => {
          const id = slugToId.get(slug);
          return id ? [id] : [];
        }),
        emergency: result.emergency,
        outOfScopeTopics: result.outOfScopeTopics,
        blocked: result.blocked,
        readyForSummary: result.readyForSummary,
      });
      const byId = new Map(flatten(catalog).map((s) => [s.id, s]));
      const assessed = new Map(result.observations.map((o) => [o.imageId, o]));
      return {
        assistantMessage: { ...this.toMessageDto(assistant, byId), quickReplies: result.quickReplies },
        assessedImages: newImageIds.map((imageId) => ({
          imageId,
          view: assessed.get(imageId)?.view ?? null,
          quality: assessed.get(imageId)?.quality ?? null,
        })),
        outOfScopeNotice: result.outOfScopeTopics.length > 0,
        emergency: result.emergency,
        readyForSummary: result.readyForSummary,
        messagesLeft: this.messagesLeft(conversation),
      };
    } catch (err) {
      await new CaseImagesRepository(this.admin()).clearTurnMarks(caseId, newImageIds).catch(() => {});
      console.error("Billedtur fejlede efter reservationen:", err instanceof Error ? err.name : "ukendt");
      throw aiUnavailable();
    }
  }

  // Modelkaldet og gemningen af svaret for en reserveret tur.
  private async answerTurn(caseId: string, conversationId: string, reserved: ReservedTurn): Promise<ChatTurnResponse> {
    const catalog = await this.services.listGroups();
    // Historikken er de seneste beskeder uden den netop reserverede (AI-laget lægger den til selv).
    const history = (await this.chat.listRecentMessages(conversationId, CHAT_CONTEXT_MESSAGES))
      .filter((m) => m.id !== reserved.message.id)
      .slice(-(CHAT_CONTEXT_MESSAGES - 1))
      .map((m) => ({ role: m.role, content: m.content }));
    const images = await this.loadImages(caseId);

    const result = await this.ai.sendTurn({ history, userMessage: reserved.message.content, catalog, images });

    const slugToId = new Map(flatten(catalog).map((s) => [s.slug, s.id]));
    const suggestedIds = result.suggestedServices.flatMap((slug) => {
      const id = slugToId.get(slug);
      return id ? [id] : [];
    });
    // 2.3 (a): assistentens svar skrives kun med service role.
    const assistant = await new ChatRepository(this.admin()).appendAssistantMessage(this.session.userId, {
      conversationId,
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
      userMessage: this.toMessageDto(reserved.message, byId),
      assistantMessage: { ...this.toMessageDto(assistant, byId), quickReplies: result.quickReplies },
      outOfScopeNotice: result.outOfScopeTopics.length > 0,
      emergency: result.emergency,
      readyForSummary: result.readyForSummary,
      messagesLeft: Math.max(0, CHAT_MAX_USER_MESSAGES_PER_CONVERSATION - reserved.userMessageCount),
    };
  }

  // Gemmer den faste tekst som svar på en reserveret tur, hvor modellen fejlede. Forsøget kan selv fejle (fx lukket
  // samtale); den oprindelige fejl er den, der returneres.
  private async storeFixedAnswer(conversationId: string): Promise<void> {
    // 2.3 (a): svaret skrives med service role.
    await new ChatRepository(this.admin())
      .appendAssistantMessage(this.session.userId, {
        conversationId,
        content: CHAT_UNAVAILABLE_TEXT,
        preliminaryAssessment: null,
        suggestedServiceIds: [],
        emergency: false,
        outOfScopeTopics: [],
        blocked: false,
        readyForSummary: false,
      })
      .catch(() => {});
  }

  // Billeder sendes kun til AI'en med aktivt image_upload-samtykke (9.4), re-encodet og som base64.
  private async loadImages(caseId: string) {
    if (!(await this.consents.hasActive("image_upload"))) return [];
    return this.imageLoader.load(await this.images.listForCase(caseId));
  }
}
