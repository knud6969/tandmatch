import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { isActiveLead } from "@/lib/leads/domain/leads";
import { MAX_IMAGE_UPLOAD_BYTES, MESSAGE_MAX_PER_DAY, SIGNED_URL_TTL_SECONDS } from "@/lib/common/constants/limits";
import { messageWithImagesSchema, type sendMessageSchema } from "@/lib/leads/schemas/messages";
import type { MessageDto, MessageImageDto, MessageSenderRole } from "@/lib/leads/types/messages";
import { ApiError, forbidden, messageLimit, threadClosed } from "@/platform/middleware/http";
import type { Session } from "@/platform/middleware/session";
import { lazyAdminClient } from "@/platform/db/admin";
import { ImageProcessingService } from "@/platform/imageProcessingService";
import { ConsentsRepository } from "@/features/identity";
import { LeadsRepository } from "@/features/leads/leadsRepository";
import { MessageImageStorage } from "@/features/leads/messageImageStorage";
import { MessageImagesRepository, type MessageImageRecord } from "@/features/leads/messageImagesRepository";
import { MessageRejectedError, MessagesRepository } from "@/features/leads/messagesRepository";

type SendMessageInput = z.infer<typeof sendMessageSchema>;

// Multipart-formularen med billeder (features/leads/README.md 10.12). Læses først, når controllerens tjek er bestået.
export type MessageImagesForm = () => Promise<{ files: File[]; fields: Record<string, string> }>;

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type MessagesDeps = {
  messages: MessagesRepository;
  leads: LeadsRepository;
  images: MessageImagesRepository;
  consents: ConsentsRepository;
  processing: ImageProcessingService;
  admin: () => SupabaseClient;
};

// Beskedtråden pr. lead (architecture 10.12). Deltagerne er patienten på sagen og den verificerede klinik bag leadet;
// alle andre får 404. Tråden er åben, mens leadet er aktivt (sent, accepted, booked) og lukket ved declined og withdrawn.
// Beskeder kan have op til 3 billeder (helbredsdata): patienten skal have det gældende image_upload-samtykke, og filerne
// genkodes uden EXIF og gemmes med service role.
export class MessagesController {
  private readonly messages: MessagesRepository;
  private readonly leads: LeadsRepository;
  private readonly images: MessageImagesRepository;
  private readonly consents: ConsentsRepository;
  private readonly processing: ImageProcessingService;
  // Service role-klienten (architecture 2.3, 2.1.1). Bruges kun til beskedbilleder: upload, indsættelse via
  // send_message_with_images() og sletning efter serverens tjek (2.3 c) og signering efter en RLS-beskyttet læsning (2.3 e).
  private readonly admin: () => SupabaseClient;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
    deps: Partial<MessagesDeps> = {},
  ) {
    this.admin = deps.admin ?? lazyAdminClient();
    this.messages = deps.messages ?? new MessagesRepository(supabase);
    this.leads = deps.leads ?? new LeadsRepository(supabase);
    this.images = deps.images ?? new MessageImagesRepository(supabase);
    this.consents = deps.consents ?? new ConsentsRepository(supabase);
    this.processing = deps.processing ?? new ImageProcessingService();
  }

  // Deltagerens rolle i tråden: kun patient og klinik; alle andre får 403 (routen afviser dem også via requireRole).
  private get role(): MessageSenderRole {
    const { role } = this.session;
    if (role !== "patient" && role !== "clinic") throw forbidden();
    return role;
  }

  // Trådens beskeder med billeder. Beskeder fra den anden part markeres som læst efter læsningen, så svaret viser, hvad der
  // var nyt. Billedstierne læses med brugerens JWT (RLS eller clinic_lead_message_images()) og signeres først derefter.
  async list(leadId: string): Promise<MessageDto[]> {
    const role = this.role;
    await this.leads.requireStatus(leadId, role); // 404 for andre end deltagerne
    const messages = await this.messages.list(role, leadId);
    const images = messages.length > 0 ? await this.images.listForLead(role, leadId) : [];
    await this.messages.markRead(role, leadId);
    return this.attachImages(messages, images);
  }

  // Sender en tekstbesked. 409 THREAD_CLOSED ved declined og withdrawn, 429 MESSAGE_LIMIT ved døgnloftet.
  async send(leadId: string, input: SendMessageInput): Promise<MessageDto> {
    const role = this.role;
    await this.requireWritable(leadId, role);
    try {
      return await this.messages.create(role, leadId, this.session.userId, input.body);
    } catch (error) {
      if (!(error instanceof MessageRejectedError)) throw error;
      // RLS afviste indsættelsen efter tjekkene ovenfor: tråden blev lukket, eller døgnloftet blev nået i mellemtiden.
      throw isActiveLead(await this.leads.requireStatus(leadId, role)) ? messageLimit() : threadClosed();
    }
  }

  // Sender en besked med 1-3 billeder og valgfri tekst (10.12). Tjek i rækkefølge: deltager (404), åben tråd (409),
  // døgnloft (429) og for patienten det gældende image_upload-samtykke (403). Først derefter læses formularen.
  async sendWithImages(leadId: string, readForm: MessageImagesForm): Promise<MessageDto> {
    const role = this.role;
    await this.requireWritable(leadId, role);
    // Samme samtykke som ved upload i AI-chatten (features/cases/README.md 9.4). Klinikken giver intet samtykke.
    if (role === "patient") {
      await this.consents.requireCurrentActive("image_upload", "Du skal give samtykke til billeder (nyeste version), før du sender et billede.");
    }

    const { files, fields } = await readForm();
    const parsed = messageWithImagesSchema.safeParse(fields);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Beskeden er ugyldig.");
    }

    const prepared: { id: string; data: Buffer; width: number; height: number }[] = [];
    for (const file of files) {
      const { data, width, height } = await this.processing.reencode(Buffer.from(await file.arrayBuffer()));
      if (data.length > MAX_IMAGE_UPLOAD_BYTES) {
        throw new ApiError(413, "FILE_TOO_LARGE", "Billedet er for stort efter behandling.");
      }
      prepared.push({ id: randomUUID(), data, width, height });
    }

    // 2.3 (c): filerne og rækkerne skrives med service role efter deltager-, tråd- og samtykketjek. Fejler indsættelsen,
    // slettes filerne igen, så der ikke ligger billeder uden en besked.
    const storage = new MessageImageStorage(this.admin());
    const paths = prepared.map((image) => MessageImageStorage.pathFor(leadId, image.id));
    const messageId = randomUUID();
    let createdAt: string;
    try {
      for (const [i, image] of prepared.entries()) await storage.upload(paths[i], image.data, "image/jpeg");
      createdAt = await new MessageImagesRepository(this.admin()).sendWithImages({
        userId: this.session.userId,
        leadId,
        messageId,
        body: parsed.data.body,
        images: prepared.map((image) => ({ id: image.id, width: image.width, height: image.height, bytes: image.data.length })),
      });
    } catch (error) {
      await storage.remove(paths).catch(() => {});
      throw error;
    }

    const urls = await storage.signedUrls(paths, SIGNED_URL_TTL_SECONDS); // 2.3 (e): egne, netop gemte billeder
    return {
      id: messageId,
      fromMe: true,
      senderRole: role,
      body: parsed.data.body,
      createdAt,
      readAt: null,
      images: prepared.map((image, i) => ({ id: image.id, url: urls[i], width: image.width, height: image.height })),
    };
  }

  // Deltager (404), åben tråd (409 THREAD_CLOSED) og døgnloftet for beskeder (429 MESSAGE_LIMIT).
  private async requireWritable(leadId: string, role: MessageSenderRole): Promise<void> {
    const status = await this.leads.requireStatus(leadId, role);
    if (!isActiveLead(status)) throw threadClosed();
    if ((await this.messages.sentLastDay()) >= MESSAGE_MAX_PER_DAY) throw messageLimit();
  }

  // Hæfter billederne på deres beskeder med korte, signerede URL'er. Service role-klienten oprettes kun, når der er billeder.
  private async attachImages(messages: MessageDto[], images: MessageImageRecord[]): Promise<MessageDto[]> {
    if (images.length === 0) return messages;
    // 2.3 (e): stierne er læst med brugerens JWT (RLS eller clinic_lead_message_images()) lige før.
    const urls = await new MessageImageStorage(this.admin()).signedUrls(
      images.map((image) => image.storagePath),
      SIGNED_URL_TTL_SECONDS,
    );
    const byMessage = new Map<string, MessageImageDto[]>();
    images.forEach((image, i) => {
      const list = byMessage.get(image.messageId) ?? [];
      list.push({ id: image.id, url: urls[i], width: image.width, height: image.height });
      byMessage.set(image.messageId, list);
    });
    return messages.map((message) => {
      const attached = byMessage.get(message.id);
      return attached ? { ...message, images: attached } : message;
    });
  }
}
