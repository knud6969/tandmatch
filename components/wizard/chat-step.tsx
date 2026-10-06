"use client";

import type { Ref } from "react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ConsentGate } from "@/components/wizard/consent-gate";
import { StepFrame, StepNav, hasActiveConsent, type StepProps } from "@/components/wizard/wizard-shared";

// Trin 3: chat med AI-assistenten. Kræver aktivt ai_processing-samtykke (architecture 7.1, 10.5).
// Anonyme har samtykket på /start, men patienter med konto giver det her.
export function ChatStep({ headingRef, ...props }: StepProps & { headingRef: Ref<HTMLHeadingElement> }) {
  const { draft, consents, reloadConsents, reloadDraft, goTo } = props;
  const hasAi = hasActiveConsent(consents, "ai_processing");

  return (
    <StepFrame index={3} title="Beskriv dit ønske i en chat" headingRef={headingRef}>
      {hasAi ? (
        <ChatPanel
          requestId={draft.id}
          onGoToSummary={() => goTo("opsummering")}
          onTurnSettled={reloadDraft}
        />
      ) : (
        <ConsentGate
          type="ai_processing"
          title="Giv samtykke til at chatte med AI-assistenten"
          intro={
            <p>
              Din tekst i chatten sendes til en AI-tjeneste, som hjælper med at strukturere din beskrivelse. AI’en giver
              ikke medicinsk rådgivning, stiller ikke diagnose og oplyser ikke pris. Det er tandlægen, der vurderer.
            </p>
          }
          buttonLabel="Giv samtykke og start samtalen"
          onGranted={reloadConsents}
        />
      )}
      <StepNav onBack={() => goTo("spoergsmaal")} onNext={() => goTo("billeder")} nextLabel="Næste: billeder" />
    </StepFrame>
  );
}
