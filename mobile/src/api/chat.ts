import type { ChatStateDto, ChatTurnResponse, ImageTurnResponse } from "@/lib/cases/types/ai";
import { apiRequest } from "./client";

// AI-chatten (architecture 10.6).
// Henter samtalen, inklusive beskeder tilbage.
export function getChat(caseId: string): Promise<ChatStateDto> {
  return apiRequest<ChatStateDto>(`/api/cases/${caseId}/chat`);
}

// Sender én besked og får AI'ens svar i samme kald.
export function sendChatMessage(caseId: string, message: string): Promise<ChatTurnResponse> {
  return apiRequest<ChatTurnResponse>(`/api/cases/${caseId}/chat`, { method: "POST", json: { message } });
}

// Billedturen: AI'en reagerer selv på de nye billeder efter en upload-batch. Ingen besked fra patienten (tom body).
export function sendImageTurn(caseId: string): Promise<ImageTurnResponse> {
  return apiRequest<ImageTurnResponse>(`/api/cases/${caseId}/chat/image-turn`, { method: "POST", json: {} });
}
