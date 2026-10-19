import type { ChatStateDto, ChatTurnResponse } from "@/lib/types/ai";
import { apiRequest } from "./client";

// AI-chatten (architecture 10.6).
export function getChat(caseId: string): Promise<ChatStateDto> {
  return apiRequest<ChatStateDto>(`/api/cases/${caseId}/chat`);
}

export function sendChatMessage(caseId: string, message: string): Promise<ChatTurnResponse> {
  return apiRequest<ChatTurnResponse>(`/api/cases/${caseId}/chat`, { method: "POST", json: { message } });
}
