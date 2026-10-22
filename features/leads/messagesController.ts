import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { isActiveLead } from "@/lib/leads/domain/leads";
import { MESSAGE_MAX_PER_DAY } from "@/lib/common/constants/limits";
import type { sendMessageSchema } from "@/lib/leads/schemas/messages";
import type { MessageDto, MessageSenderRole } from "@/lib/leads/types/messages";
import { forbidden, messageLimit, threadClosed } from "@/platform/middleware/http";
import type { Session } from "@/platform/middleware/session";
import { LeadsRepository } from "@/features/leads/leadsRepository";
import { MessageRejectedError, MessagesRepository } from "@/features/leads/messagesRepository";

type SendMessageInput = z.infer<typeof sendMessageSchema>;

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type MessagesDeps = { messages: MessagesRepository; leads: LeadsRepository };

// Beskedtråden pr. lead (architecture 10.12). Deltagerne er patienten på sagen og den verificerede klinik bag leadet;
// alle andre får 404. Tråden er åben, mens leadet er aktivt (sent, accepted, booked) og lukket ved declined og withdrawn.
export class MessagesController {
  private readonly messages: MessagesRepository;
  private readonly leads: LeadsRepository;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
    deps: Partial<MessagesDeps> = {},
  ) {
    this.messages = deps.messages ?? new MessagesRepository(supabase);
    this.leads = deps.leads ?? new LeadsRepository(supabase);
  }

  // Deltagerens rolle i tråden: kun patient og klinik; alle andre får 403 (routen afviser dem også via requireRole).
  private get role(): MessageSenderRole {
    const { role } = this.session;
    if (role !== "patient" && role !== "clinic") throw forbidden();
    return role;
  }

  // Trådens beskeder. Beskeder fra den anden part markeres som læst efter læsningen, så svaret viser, hvad der var nyt.
  async list(leadId: string): Promise<MessageDto[]> {
    const role = this.role;
    await this.leads.requireStatus(leadId, role); // 404 for andre end deltagerne
    const messages = await this.messages.list(role, leadId);
    await this.messages.markRead(role, leadId);
    return messages;
  }

  // Sender en besked. 409 THREAD_CLOSED ved declined og withdrawn, 429 MESSAGE_LIMIT ved døgnloftet.
  async send(leadId: string, input: SendMessageInput): Promise<MessageDto> {
    const role = this.role;
    const status = await this.leads.requireStatus(leadId, role);
    if (!isActiveLead(status)) throw threadClosed();
    if ((await this.messages.sentLastDay()) >= MESSAGE_MAX_PER_DAY) throw messageLimit();
    try {
      return await this.messages.create(role, leadId, this.session.userId, input.body);
    } catch (error) {
      if (!(error instanceof MessageRejectedError)) throw error;
      // RLS afviste indsættelsen efter tjekkene ovenfor: tråden blev lukket, eller døgnloftet blev nået i mellemtiden.
      throw isActiveLead(await this.leads.requireStatus(leadId, role)) ? messageLimit() : threadClosed();
    }
  }
}
