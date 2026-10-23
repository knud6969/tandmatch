import type { z } from "zod";
import type { sendMessageSchema } from "@/lib/leads/schemas/messages";
import type { MessageDto } from "@/lib/leads/types/messages";
import { apiRequest } from "./client";

// Beskedtråden pr. lead (architecture 10.12). THREAD_CLOSED og MESSAGE_LIMIT kommer som ApiRequestError med dansk tekst.

// Henter tråden og markerer klinikkens beskeder som læst.
export async function listMessages(leadId: string): Promise<MessageDto[]> {
  const result = await apiRequest<{ messages: MessageDto[] }>(`/api/leads/${encodeURIComponent(leadId)}/messages`);
  return result.messages;
}

export function sendMessage(leadId: string, input: z.infer<typeof sendMessageSchema>): Promise<MessageDto> {
  return apiRequest<MessageDto>(`/api/leads/${encodeURIComponent(leadId)}/messages`, { method: "POST", json: input });
}
