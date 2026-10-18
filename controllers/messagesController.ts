import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { isActiveLead } from "@/lib/domain/leads";
import { MESSAGE_MAX_PER_DAY } from "@/lib/constants/limits";
import type { sendMessageSchema } from "@/lib/schemas/messages";
import type { MessageDto, MessageSenderRole } from "@/lib/types/messages";
import { messageLimit, threadClosed } from "@/middleware/http";
import type { Session } from "@/middleware/session";
import { LeadsRepository } from "@/models/leadsRepository";
import { MessagesRepository } from "@/models/messagesRepository";

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

  // Deltagerens rolle i tråden. Routen har afvist anonyme og andre roller end patient og klinik (requireRole).
  private get role(): MessageSenderRole {
    return this.session.role as MessageSenderRole;
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
    return this.messages.create(role, leadId, this.session.userId, input.body);
  }
}
