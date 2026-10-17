import type { CONVERSATION_STATUSES, IMAGE_QUALITIES, IMAGE_VIEWS, OUT_OF_SCOPE_TOPICS } from "@/lib/constants/ai";
import type { ServiceDto } from "@/lib/types/services";

// Delte AI-typer (architecture 7.4, 10.6). Skemaerne er strict: ingen felter for pris eller klinikker.
// MDR-TILPASNING: feltet preliminaryAssessment fjernes eller tvinges til null i services/ai/rules.ts (architecture 7.8).
export type OutOfScopeTopic = (typeof OUT_OF_SCOPE_TOPICS)[number];
export type ImageView = (typeof IMAGE_VIEWS)[number];
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export type AiImageObservation = {
  imageRef: string; // case_images.id på serveren (intern "img_n" mappes før lagring)
  view: ImageView;
  visibleArea: string; // max 80 tegn
  observations: string[]; // max 4, hver max 120 tegn. Kun synlige forhold uden fortolkning
  quality: ImageQuality;
};

// Opsummering (udkast til klinikken). Indeholder ikke den foreløbige vurdering. Patienten godkender altid.
export type AiSummary = {
  summaryText: string; // max 800 tegn
  patientWishes: string[]; // max 5
  patientReportedHistory: string[]; // max 5
  suggestedServices: string[]; // max 5 slugs
  images: AiImageObservation[];
  outOfScopeTopics: OutOfScopeTopic[];
};

// API-typer (architecture 10.6)
export type AiChatMessageDto = {
  id: string;
  role: "user" | "assistant";
  content: string;
  preliminaryAssessment: string | null;
  suggestedServices: ServiceDto[];
  emergency: boolean;
  outOfScopeTopics: OutOfScopeTopic[];
  blocked: boolean;
  createdAt: string;
};

export type ChatStateDto = {
  conversationId: string | null;
  status: ConversationStatus;
  messages: AiChatMessageDto[];
  messagesLeft: number;
  readyForSummary: boolean;
};

export type ChatTurnResponse = {
  userMessage: AiChatMessageDto;
  assistantMessage: AiChatMessageDto;
  outOfScopeNotice: boolean;
  emergency: boolean;
  readyForSummary: boolean;
  messagesLeft: number;
};

// Samtalen og dens beskeder, som repositoriet returnerer dem (camelCase). Slugs/ydelser slås op af controlleren.
export type AiConversationRecord = {
  id: string;
  caseId: string;
  status: ConversationStatus;
  userMessageCount: number;
  promptVersion: string | null;
  model: string | null;
  createdAt: string;
};

export type AiMessageRecord = {
  id: string;
  role: "user" | "assistant";
  content: string;
  preliminaryAssessment: string | null;
  suggestedServiceIds: string[];
  emergency: boolean;
  outOfScopeTopics: OutOfScopeTopic[];
  blocked: boolean;
  readyForSummary: boolean;
  createdAt: string;
};

// Dataeksport (GDPR art. 15/20): patientens egne AI-samtaler pr. sag. Beskederne er maskeret, som de er gemt.
export type ChatExportDto = {
  caseId: string;
  status: ConversationStatus;
  userMessageCount: number;
  promptVersion: string | null;
  model: string | null;
  createdAt: string;
  messages: AiMessageRecord[];
};

// Svaret på POST /api/cases/{id}/summary (architecture 10.5).
export type SummaryResponse = {
  summary: AiSummary | null;
  retakeImages: { imageId: string; reason: Exclude<ImageQuality, "ok"> }[];
  outOfScopeNotice: boolean;
  fallback: "none" | "write_yourself";
  generationsLeft: number;
};

export type ApproveSummaryResponse = { summaryText: string; summaryApprovedAt: string };
