import { SERVICE_CARD_AFTER_USER_MESSAGES } from "@/lib/cases/constants/case-flow";
import type { ChatStateDto } from "@/lib/cases/types/ai";
import type { CaseDto, CaseFlowStep } from "@/lib/cases/types/cases";

// Hvilket kort i samtaleflowet der er aktuelt (architecture 7.9). Første regel, der passer. Ren funktion.
// Er trinnet "ready", afgør `canSend` på sagen, om knappen eller en forklaring vises.
export function nextCaseFlowStep(
  caseDto: Pick<
    CaseDto,
    "status" | "services" | "suggestedServices" | "preferredTimeframe" | "postalCode" | "summaryApprovedAt"
  >,
  chatState: Pick<ChatStateDto, "messages" | "status" | "readyForSummary">,
): CaseFlowStep {
  if (caseDto.status !== "draft") return "submitted";

  const lastAssistant = [...chatState.messages].reverse().find((m) => m.role === "assistant");
  if (lastAssistant?.emergency) return "emergency";

  if (caseDto.services.length === 0) {
    // 7.9a regel 1: kortet vises ved klar-signal, lukket samtale, forslag eller nok patientbeskeder.
    const userMessages = chatState.messages.filter((m) => m.role === "user").length;
    const showCard =
      chatState.readyForSummary ||
      chatState.status === "closed" ||
      caseDto.suggestedServices.length > 0 ||
      userMessages >= SERVICE_CARD_AFTER_USER_MESSAGES;
    return showCard ? "services" : "chat";
  }
  if (caseDto.preferredTimeframe === null) return "timeframe";
  if (caseDto.postalCode === null) return "postal_code";
  if (caseDto.summaryApprovedAt === null) return "summary";
  return "ready";
}
