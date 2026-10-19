"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { hasCurrentConsent } from "@/lib/domain/consents";
import type { CaseDto } from "@/lib/types/cases";
import { ChatPanel } from "@/views/components/chat/chat-panel";
import { DeleteConversation } from "@/views/components/case/delete-conversation";
import { ImagesStep, type RetakeImage } from "@/views/components/case/images-step";
import { ServicesStep } from "@/views/components/case/services-step";
import { SummaryStep } from "@/views/components/case/summary-step";
import { TimeframeStep } from "@/views/components/case/timeframe-step";
import { AnonymousPatientBanner } from "@/views/components/session/anonymous-patient-banner";
import { Alert } from "@/views/components/ui/alert";
import { LinkButton } from "@/views/components/ui/button";
import { cx } from "@/views/components/ui/cx";
import { LoadState } from "@/views/components/ui/load-state";
import { apiRequest } from "@/views/utils/api-client";
import { caseHref } from "@/views/utils/case-links";
import { loadConsents } from "@/views/utils/consents";
import { useLoad } from "@/views/utils/use-load";

const STEPS = [
  { id: "chat", label: "Beskriv" },
  { id: "images", label: "Billeder" },
  { id: "services", label: "Behandlinger" },
  { id: "timeframe", label: "Tid og sted" },
  { id: "summary", label: "Opsummering" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

function Stepper({ current, onSelect }: { current: StepId; onSelect: (id: StepId) => void }) {
  const index = STEPS.findIndex((s) => s.id === current);
  return (
    <nav aria-label="Trin i din sag" className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-ink-muted" aria-live="polite">
        Trin {index + 1} af {STEPS.length}: <span className="text-ink">{STEPS[index].label}</span>
      </p>
      <ol className="grid grid-cols-5 gap-1.5">
        {STEPS.map((step, i) => (
          <li key={step.id}>
            <button
              type="button"
              onClick={() => onSelect(step.id)}
              aria-current={step.id === current ? "step" : undefined}
              aria-label={`${i + 1}. ${step.label}`}
              className={cx(
                "flex min-h-11 w-full items-center justify-center rounded-control px-1 text-sm font-semibold ring-1 ring-inset transition-colors",
                step.id === current
                  ? "bg-brand-600 text-on-brand ring-brand-600"
                  : i < index
                    ? "bg-brand-50 text-brand-800 ring-brand-200"
                    : "bg-surface text-ink-muted ring-line",
              )}
            >
              <span className="sm:hidden" aria-hidden="true">
                {i + 1}
              </span>
              <span className="hidden truncate sm:inline" aria-hidden="true">
                {step.label}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

// Sagsflowet (architecture 6.1): chat, billeder, behandlinger, tid og sted og en opsummering, som patienten godkender.
// Næste skridt (klinikker, konto og afsendelse) er trin 4.
export function CaseFlow({ caseId }: { caseId: string }) {
  const loadCase = useCallback(() => apiRequest<CaseDto>(`/api/cases/${caseId}`), [caseId]);
  const caseState = useLoad(loadCase);
  const consents = useLoad(loadConsents);
  const [step, setStep] = useState<StepId>("chat");
  const [retake, setRetake] = useState<RetakeImage[]>([]);
  const [grantedNow, setGrantedNow] = useState<{ ai: boolean; image: boolean }>({ ai: false, image: false });

  const caseDto = caseState.data;
  const aiConsent = grantedNow.ai || (consents.data !== null && hasCurrentConsent(consents.data, "ai_processing"));
  const imageConsent = grantedNow.image || (consents.data !== null && hasCurrentConsent(consents.data, "image_upload"));
  const go = (id: StepId) => {
    setStep(id);
    window.scrollTo?.({ top: 0 });
  };

  if (caseState.error) {
    const missing = caseState.errorCode === "NOT_FOUND";
    return (
      <div className="mx-auto flex w-full max-w-narrow flex-col gap-4 px-4 py-8 sm:px-6">
        <LoadState loading={false} error={caseState.error} onRetry={caseState.reload} />
        {missing && (
          <Link href="/start" className="font-semibold text-brand-700">
            Start en ny samtale
          </Link>
        )}
      </div>
    );
  }
  if (!caseDto || consents.loading) {
    return (
      <div className="mx-auto w-full max-w-narrow px-4 py-8 sm:px-6">
        <LoadState loading error={null} onRetry={caseState.reload} />
      </div>
    );
  }

  if (caseDto.status !== "draft") {
    const closed = caseDto.status === "closed";
    return (
      <div className="mx-auto flex w-full max-w-narrow flex-col gap-4 px-4 py-8 sm:px-6">
        <Alert tone="info" title={closed ? "Sagen er lukket" : "Sagen er sendt"}>
          <p>
            {closed
              ? "Sagen kan ikke ændres, fordi den er lukket. Du kan starte en ny samtale, hvis du har brug for hjælp igen."
              : "Sagen kan ikke ændres, fordi den allerede er sendt. Du kan følge den under Mine sager."}
          </p>
        </Alert>
        {closed ? (
          <Link href="/start" className="font-semibold text-brand-700">
            Start en ny samtale
          </Link>
        ) : (
          <LinkButton href={caseHref(caseId)}>Se din sag</LinkButton>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-narrow flex-col gap-5 px-4 py-6 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Beskriv dit problem</h1>
        <p className="text-base text-ink-muted">Fortæl med dine egne ord. Klinikkerne svarer ud fra din godkendte beskrivelse.</p>
      </header>

      <AnonymousPatientBanner />
      <Stepper current={step} onSelect={go} />

      {step === "chat" && (
        <ChatPanel
          caseId={caseId}
          aiConsentGiven={aiConsent}
          onAiConsent={() => setGrantedNow((g) => ({ ...g, ai: true }))}
          onTurn={caseState.reload}
          onContinue={() => go("images")}
        />
      )}
      {step === "images" && (
        <ImagesStep
          caseDto={caseDto}
          imageConsentGiven={imageConsent}
          onImageConsent={() => setGrantedNow((g) => ({ ...g, image: true }))}
          retake={retake}
          onChanged={caseState.reload}
          onBack={() => go("chat")}
          onContinue={() => go("services")}
        />
      )}
      {step === "services" && (
        <ServicesStep caseDto={caseDto} onSaved={caseState.reload} onBack={() => go("images")} onContinue={() => go("timeframe")} />
      )}
      {step === "timeframe" && (
        <TimeframeStep caseDto={caseDto} onSaved={caseState.reload} onBack={() => go("services")} onContinue={() => go("summary")} />
      )}
      {step === "summary" && (
        <SummaryStep
          caseDto={caseDto}
          retake={retake}
          onRetake={setRetake}
          onChanged={caseState.reload}
          onBack={() => go("timeframe")}
          onGoToImages={() => go("images")}
        />
      )}

      {caseDto.hasConversation || caseDto.images.length > 0 ? (
        <div className="border-t border-line pt-5">
          <DeleteConversation caseId={caseId} />
        </div>
      ) : null}
    </div>
  );
}
