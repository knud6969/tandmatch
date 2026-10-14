import type { ServiceDto } from "@/lib/types/services";

// Delte AI-typer (architecture 7.4, 10.6). Skemaerne er strict: ingen felter for pris eller klinikker.
// MDR-TILPASNING: feltet preliminaryAssessment fjernes eller tvinges til null i services/ai/rules.ts (architecture 7.8).
export type OutOfScopeTopic = "price" | "clinic_recommendation";

// Chat: ét svar pr. patientbesked
export type AiChatTurn = {
  reply: string; // max 700 tegn. Spørgsmål, forklaring, procesvejledning
  preliminaryAssessment: string | null; // max 400 tegn. Altid foreløbig; null hvis rules.ts slår vurdering fra
  suggestedServices: string[]; // max 5 slugs fra kataloget
  emergency: boolean; // akutte tegn
  outOfScopeTopics: OutOfScopeTopic[];
  readyForSummary: boolean; // aktiverer kun en knap
};

export type ImageView = "front" | "upper" | "lower" | "side_left" | "side_right" | "unclear";
export type ImageQuality = "ok" | "too_dark" | "blurry" | "wrong_angle" | "not_teeth";

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
  status: "active" | "closed";
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
