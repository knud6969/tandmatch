import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { approveSummarySchema } from "@/lib/cases/schemas/chat";
import { buildsOnAiDraft, imageDescription } from "@/lib/cases/domain/summary";
import type { ApproveSummaryResponse, SummaryResponse } from "@/lib/cases/types/ai";
import { ApiError, aiUnavailable } from "@/platform/middleware/http";
import type { Session } from "@/platform/middleware/session";
import { CaseImagesRepository } from "@/features/cases/caseImagesRepository";
import { CaseServicesRepository } from "@/features/cases/caseServicesRepository";
import { CasesRepository } from "@/features/cases/casesRepository";
import { ChatRepository } from "@/features/cases/chatRepository";
import { ConsentsRepository } from "@/features/identity/consentsRepository";
import { lazyAdminClient } from "@/platform/db/admin";
import { ServicesRepository } from "@/models/servicesRepository";
import { isAiUpstreamError } from "@/features/cases/ai/errors";
import { AiSummaryService } from "@/features/cases/ai/aiSummaryService";
import { createAiClient } from "@/features/cases/ai/openai";
import { AI_RULES } from "@/features/cases/ai/rules";
import { AiImageService } from "@/features/cases/aiImageService";
import { SummaryRepository } from "@/features/cases/summaryRepository";

type ApproveInput = z.infer<typeof approveSummarySchema>;

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type SummaryDeps = {
  cases: CasesRepository;
  consents: ConsentsRepository;
  chat: ChatRepository;
  summary: SummaryRepository;
  caseServices: CaseServicesRepository;
  services: ServicesRepository;
  images: CaseImagesRepository;
  imageLoader: AiImageService;
  ai: AiSummaryService;
  admin: () => SupabaseClient;
};

// Opsummeringen til klinikken (architecture 7.1, 10.5): AI skriver et udkast, patienten retter og godkender.
// Controlleren kender hverken prompts eller OpenAI: det gør AiSummaryService.
export class SummaryController {
  private readonly cases: CasesRepository;
  private readonly consents: ConsentsRepository;
  private readonly chat: ChatRepository;
  private readonly summary: SummaryRepository;
  private readonly caseServices: CaseServicesRepository;
  private readonly services: ServicesRepository;
  private readonly images: CaseImagesRepository;
  private readonly imageLoader: AiImageService;
  private readonly ai: AiSummaryService;
  // Service role-klienten (architecture 2.3). Bruges kun til at gemme udkastet og billedbeskrivelserne (a, c).
  private readonly admin: () => SupabaseClient;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
    deps: Partial<SummaryDeps> = {},
  ) {
    this.admin = deps.admin ?? lazyAdminClient();
    this.cases = deps.cases ?? new CasesRepository(supabase);
    this.consents = deps.consents ?? new ConsentsRepository(supabase);
    this.chat = deps.chat ?? new ChatRepository(supabase);
    this.summary = deps.summary ?? new SummaryRepository(supabase);
    this.caseServices = deps.caseServices ?? new CaseServicesRepository(supabase);
    this.services = deps.services ?? new ServicesRepository(supabase);
    this.images = deps.images ?? new CaseImagesRepository(supabase);
    this.imageLoader = deps.imageLoader ?? new AiImageService(this.admin);
    this.ai = deps.ai ?? new AiSummaryService(createAiClient(), AI_RULES);
  }

  // Laver et udkast. Genereringen tælles (consume_summary_generation) før modelkaldet, også hvis modellen fejler, så
  // lofterne ikke kan omgås. Ved `fallback = "write_yourself"` gemmes intet, og patienten skriver selv.
  //
  // Billeder med dårlig kvalitet (`retakeImages`): udkastet GEMMES, og listen returneres, så UI kan bede om nye billeder.
  // Kvaliteten gemmes på billedet (ai_quality). Serveren blokerer ikke godkendelsen; patienten informeres kun.
  async generate(caseId: string): Promise<SummaryResponse> {
    await this.cases.requireOwnDraft(caseId);
    await this.consents.requireCurrentActive("ai_processing", "Du skal give samtykke til AI-behandling, før du kan få en opsummering.");

    const conversation = await this.chat.findConversation(caseId);
    const messages = conversation ? await this.chat.listMessages(conversation.id) : [];
    if (!messages.some((m) => m.role === "user")) {
      throw new ApiError(409, "NO_CONVERSATION", "Fortæl først AI-assistenten om dit ønske, eller skriv opsummeringen selv.");
    }

    // 2.3 (a): tællingen kan kun udføres af service role. Serveren giver den verificerede session som bruger, og IP-grænsen
    // er allerede talt i route.ts.
    const generationsLeft = await new SummaryRepository(this.admin()).consumeGeneration(this.session.userId, caseId);

    const catalog = await this.services.listGroups();
    const confirmed = await this.caseServices.listForCase(caseId);
    const confirmedServices = await this.services.findActive(confirmed.map((c) => c.serviceId));
    const imageRecords = (await this.consents.hasActive("image_upload")) ? await this.images.listForCase(caseId) : [];
    const images = await this.imageLoader.load(imageRecords);

    let result;
    try {
      result = await this.ai.generate({
        history: messages.map((m) => ({ role: m.role, content: m.content })),
        confirmedSlugs: confirmedServices.map((s) => s.slug),
        catalog,
        images,
      });
    } catch (err) {
      if (isAiUpstreamError(err)) throw aiUnavailable();
      throw err;
    }

    if (result.summary) {
      // 2.3 (a, c): udkastet og billedbeskrivelserne skrives med service role, efter ejer-, kladde- og samtykketjek.
      await new SummaryRepository(this.admin()).store({
        userId: this.session.userId,
        caseId,
        summary: result.summary,
        model: result.model,
        promptVersion: `${result.promptVersion}+${result.rulesVersion}`,
      });
      const imagesWrite = new CaseImagesRepository(this.admin());
      for (const image of result.summary.images) {
        await imagesWrite.saveObservation(image.imageRef, {
          view: image.view,
          quality: image.quality,
          description: imageDescription(image.visibleArea, image.observations),
        });
      }
    }

    return {
      summary: result.summary,
      retakeImages: result.retakeImages,
      outOfScopeNotice: result.outOfScopeTopics.length > 0,
      fallback: result.fallback,
      generationsLeft,
    };
  }

  // Patientens rettede opsummering godkendes med approve_summary() (eneste vej til summary_text).
  async approve(caseId: string, input: ApproveInput): Promise<ApproveSummaryResponse> {
    const record = await this.cases.requireOwnDraft(caseId);
    const aiAssisted = buildsOnAiDraft(input.summaryText, record.aiSummary);
    const summaryApprovedAt = await this.summary.approve(caseId, input.summaryText, aiAssisted);
    return { summaryText: input.summaryText, summaryApprovedAt };
  }
}
