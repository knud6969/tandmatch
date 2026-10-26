import "server-only";
import type { MessageSenderRole } from "@/lib/leads/types/messages";
import { MESSAGE_IMAGE_LIMIT_TEXT } from "@/lib/common/constants/error-texts";
import { MESSAGE_MAX_IMAGES } from "@/lib/common/constants/limits";
import { ApiError, consentRequired, forbidden, messageLimit, notFound, threadClosed } from "@/platform/middleware/http";
import { BaseRepository } from "@/platform/base/baseRepository";
import type { Tables } from "@/platform/db/database.types";

type ImageRow = Pick<Tables<"message_images">, "id" | "message_id" | "position" | "storage_path" | "width" | "height">;

// Billedet, som serveren bruger det. `storagePath` forlader aldrig serveren (MessageImageDto har kun en signeret URL).
export type MessageImageRecord = { id: string; messageId: string; position: number; storagePath: string; width: number; height: number };

export type NewMessageWithImages = {
  userId: string;
  leadId: string;
  messageId: string;
  body: string;
  images: { id: string; width: number; height: number; bytes: number }[];
};

const IMAGE_COLUMNS = "id, message_id, position, storage_path, width, height";

// Billeder i beskedtråden (features/leads/README.md 4.3 `message_images`, 10.12). Patienten læser med sin JWT (RLS: egne
// tråde); klinikken har ingen SELECT og læser via clinic_lead_message_images(), som intet returnerer for en anden klinik eller
// et tilbagetrukket lead. Rækker skrives kun af send_message_with_images() med service role-klienten (2.3 c).
export class MessageImagesRepository extends BaseRepository<ImageRow, MessageImageRecord> {
  protected toDto(row: ImageRow): MessageImageRecord {
    return {
      id: row.id,
      messageId: row.message_id,
      position: row.position,
      storagePath: row.storage_path,
      width: row.width,
      height: row.height,
    };
  }

  // Trådens billeder, sorteret efter besked og position.
  async listForLead(role: MessageSenderRole, leadId: string): Promise<MessageImageRecord[]> {
    if (role === "clinic") {
      return this.toDtos(await this.rpc<ImageRow[]>("clinic_lead_message_images", { p_lead_id: leadId }));
    }
    return this.toDtos(
      await this.runList(
        this.db.from("message_images").select(IMAGE_COLUMNS).eq("lead_id", leadId).order("created_at").order("message_id").order("position"),
        "message_images: select fejlede",
      ),
    );
  }

  // Kun service role (2.3 c): indsætter beskeden og billedrækkerne i én transaktion, efter at filerne er uploadet.
  // Funktionen tjekker selv deltager, åben tråd, lofter og patientens samtykke. Returnerer beskedens created_at.
  async sendWithImages(input: NewMessageWithImages): Promise<string> {
    const created = await this.rpc<string>(
      "send_message_with_images",
      { p_user_id: input.userId, p_lead_id: input.leadId, p_message_id: input.messageId, p_body: input.body, p_images: input.images },
      {
        // MESSAGE_IMAGE_LIMIT før IMAGE_LIMIT: fejlkoderne matches som delstrenge i rækkefølge.
        MESSAGE_IMAGE_LIMIT: new ApiError(429, "MESSAGE_IMAGE_LIMIT", MESSAGE_IMAGE_LIMIT_TEXT),
        MESSAGE_LIMIT: messageLimit(),
        IMAGE_LIMIT: new ApiError(400, "IMAGE_LIMIT", `Du kan højst vedhæfte ${MESSAGE_MAX_IMAGES} billeder pr. besked.`),
        THREAD_CLOSED: threadClosed(),
        CONSENT_REQUIRED: consentRequired("Du skal give samtykke til billeder, før du sender et billede."),
        ACCOUNT_REQUIRED: forbidden(),
        NOT_FOUND: notFound(),
        VALIDATION_ERROR: new ApiError(400, "VALIDATION_ERROR", "Beskeden er ugyldig."),
      },
    );
    return this.requireRow(created);
  }
}
