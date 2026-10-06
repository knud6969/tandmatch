"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type Ref } from "react";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { LinkButton } from "@/components/ui/button";
import { PageIntro } from "@/components/ui/page-intro";
import { useSession } from "@/components/session/session-provider";
import { DeleteConversation } from "@/components/wizard/delete-conversation";
import { CategoryStep } from "@/components/wizard/category-step";
import { ChatStep } from "@/components/wizard/chat-step";
import { ImagesStep } from "@/components/wizard/images-step";
import { QuestionsStep } from "@/components/wizard/questions-step";
import { SendStep } from "@/components/wizard/send-step";
import { SummaryStep } from "@/components/wizard/summary-step";
import { WizardStepper } from "@/components/wizard/wizard-stepper";
import { type StepProps, type WizardStep } from "@/components/wizard/wizard-shared";
import { ApiRequestError, apiRequest } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/error-messages";
import type { ConsentDto, RequestDraftDto } from "@/lib/types/requests";

// Kontekst for 404: ikke-ejere og ukendte id'er får samme svar, så teksten siger ikke mere end det.
function draftErrorMessage(err: unknown): string {
  if (err instanceof ApiRequestError && err.status === 404) {
    return "Forespørgslen kunne ikke findes. Den kan være slettet, eller linket er forkert.";
  }
  return apiErrorMessage(err);
}

const dateFormat: Intl.DateTimeFormatOptions = { dateStyle: "long", timeStyle: "short" };

// Patientens wizard for /start/[requestId] (architecture 6.1). Bruges af både anonyme og patienter med konto.
// Al data hentes via /api/* og vises som ren tekst. Ejerskab håndhæves af API'et (404 for andres).
export function RequestWizard({ requestId }: { requestId: string }) {
  const router = useRouter();
  const { state, refresh } = useSession();
  const me = state.status === "ready" ? state.me : null;
  const isAnonymous = me?.isAnonymous ?? false;

  const [draft, setDraft] = useState<RequestDraftDto | null>(null);
  const [consents, setConsents] = useState<ConsentDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<WizardStep>("kategori");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stepChanged = useRef(false);

  const reloadDraft = useCallback(async () => {
    try {
      setDraft(await apiRequest<RequestDraftDto>(`/api/requests/${requestId}`));
      setLoadError(null);
    } catch (err) {
      setLoadError(draftErrorMessage(err));
    }
  }, [requestId]);

  const reloadConsents = useCallback(async () => {
    try {
      const data = await apiRequest<{ consents: ConsentDto[] }>("/api/consents");
      setConsents(data.consents);
    } catch (err) {
      setLoadError(apiErrorMessage(err));
    }
  }, []);

  // Første indlæsning. Kald og svar håndteres inline, så effekten ikke sætter state synkront.
  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<RequestDraftDto>(`/api/requests/${requestId}`),
      apiRequest<{ consents: ConsentDto[] }>("/api/consents"),
    ])
      .then(([loadedDraft, loadedConsents]) => {
        if (!active) return;
        setDraft(loadedDraft);
        setConsents(loadedConsents.consents);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (active) setLoadError(draftErrorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [requestId]);

  // Hent kladden igen ved hvert trinskift, så fx "godkendt" ikke står tilbage efter en ændring i chat eller billeder.
  // Fokus flyttes til trinets overskrift, så tastatur- og skærmlæserbrugere ved, at indholdet har skiftet.
  useEffect(() => {
    if (!stepChanged.current) {
      stepChanged.current = true;
      return;
    }
    headingRef.current?.focus();
    void reloadDraft();
  }, [step, reloadDraft]);

  async function onDeleted() {
    await refresh();
    router.replace("/");
    router.refresh();
  }

  if (!draft) {
    if (loadError) {
      return (
        <Container>
          <Alert tone="danger" role="alert" title="Forespørgslen kunne ikke hentes">
            <p>{loadError}</p>
          </Alert>
          <LinkButton href="/start" variant="secondary" className="w-full sm:w-auto">
            Start en ny samtale
          </LinkButton>
        </Container>
      );
    }
    return (
      <Container>
        <p role="status" className="text-base text-ink-muted">
          Henter din forespørgsel …
        </p>
      </Container>
    );
  }

  if (draft.status !== "draft") {
    return (
      <Container>
        <PageIntro title="Din forespørgsel er sendt">
          <p>Forespørgslen er sendt, og den kan ikke ændres længere.</p>
        </PageIntro>
        <LinkButton href="/patient" className="w-full sm:w-auto">
          Gå til mine forespørgsler
        </LinkButton>
      </Container>
    );
  }

  const expires = me?.anonymousExpiresAt ? new Date(me.anonymousExpiresAt).toLocaleString("da-DK", dateFormat) : null;
  const stepProps: StepProps = {
    draft,
    onDraftChange: setDraft,
    reloadDraft,
    consents,
    reloadConsents,
    isAnonymous,
    goTo: setStep,
  };

  return (
    <Container size="wide">
      {isAnonymous && (
        <Alert tone="warning" title="Du bruger TandMatch uden konto">
          <p>
            {expires
              ? `Din samtale gemmes til ${expires}, hvis du ikke opretter en konto.`
              : "Din samtale gemmes i en kort periode, hvis du ikke opretter en konto."}{" "}
            Du skal have en konto, før forespørgslen sendes til tandlæger.
          </p>
        </Alert>
      )}

      <PageIntro title="Din forespørgsel">
        <p>
          Gå frem og tilbage, indtil du sender. Du kan altid rette det, du har skrevet. Det er tandlægen, der vurderer din
          situation.
        </p>
      </PageIntro>

      {loadError && (
        <Alert tone="danger" role="alert">
          {loadError}
        </Alert>
      )}

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <WizardStepper current={step} onSelect={setStep} />
        <Card>
          <CurrentStep step={step} stepProps={stepProps} headingRef={headingRef} refreshSession={refresh} />
        </Card>
      </div>

      {isAnonymous && <DeleteConversation onDeleted={onDeleted} />}

    </Container>
  );
}

function CurrentStep({
  step,
  stepProps,
  headingRef,
  refreshSession,
}: {
  step: WizardStep;
  stepProps: StepProps;
  headingRef: Ref<HTMLHeadingElement>;
  refreshSession: () => Promise<void>;
}) {
  switch (step) {
    case "kategori":
      return <CategoryStep {...stepProps} headingRef={headingRef} />;
    case "spoergsmaal":
      return <QuestionsStep {...stepProps} headingRef={headingRef} />;
    case "chat":
      return <ChatStep {...stepProps} headingRef={headingRef} />;
    case "billeder":
      return <ImagesStep {...stepProps} headingRef={headingRef} />;
    case "opsummering":
      return <SummaryStep {...stepProps} headingRef={headingRef} />;
    case "send":
      return <SendStep {...stepProps} headingRef={headingRef} refreshSession={refreshSession} />;
  }
}
