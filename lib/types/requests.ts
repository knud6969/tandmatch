import type { CosmeticCategory, ConsentType, ImageDto, RequestStatus } from "@/lib/types/common";
import type { AiSummary, ImageQuality, OutOfScopeTopic } from "@/lib/types/ai";

export type RequestDraftDto = {
  id: string;
  status: RequestStatus;
  category: CosmeticCategory;
  answers: Record<string, string | string[]>;
  questionsVersion: string;
  freeText: string | null;
  postalCode: string | null;
  maxDistanceKm: number;
  images: ImageDto[];
  hasConversation: boolean;
  aiSummary: AiSummary | null;
  summaryText: string | null;
  summaryApprovedAt: string | null;
  sentAt: string | null;
  expiresAt: string | null;
  responseCount: number; // 0 indtil svar findes (trin 3)
};

export type RequestListItemDto = {
  id: string;
  category: CosmeticCategory;
  status: RequestStatus;
  sentAt: string | null;
  expiresAt: string | null;
  responseCount: number;
  unreadMessages: number;
};

export type AiChatMessageDto = {
  id: string;
  role: "user" | "assistant";
  content: string;
  outOfScopeTopics: OutOfScopeTopic[];
  blocked: boolean;
  createdAt: string;
};

export type ChatStateDto = {
  conversationId: string | null;
  status: "active" | "closed";
  messages: AiChatMessageDto[];
  messagesLeft: number;
  readyForSummary: boolean;
};

export type ChatTurnResponse = {
  userMessage: AiChatMessageDto;
  assistantMessage: AiChatMessageDto;
  outOfScopeNotice: boolean;
  readyForSummary: boolean;
  messagesLeft: number;
};

// Svar fra POST /api/requests/{id}/summary (architecture 10.4).
export type SummaryResponse = {
  summary: AiSummary | null; // null hvis AI fejlede to gange, eller billeder skal tages om
  retakeImages: { imageId: string; reason: Exclude<ImageQuality, "ok"> }[];
  outOfScopeNotice: boolean;
  fallback: "none" | "write_yourself";
  generationsLeft: number; // udkast tilbage på forespørgslen (5, anonym: 3), jf. architecture 7.6
};

export type ConsentDto = {
  id: string;
  type: ConsentType;
  textVersion: string;
  grantedAt: string;
  grantedWhileAnonymous: boolean;
  withdrawnAt: string | null;
};
