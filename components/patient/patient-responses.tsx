"use client";

import { useEffect, useState } from "react";
import { DecisionControls, type Decision } from "@/components/patient/decision-controls";
import { ResponseDetails } from "@/components/responses/response-details";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AiDisclaimer } from "@/components/ui/disclaimer";
import { LinkButton } from "@/components/ui/button";
import { PageIntro } from "@/components/ui/page-intro";
import { ApiRequestError, apiRequest } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/error-messages";
import { categoryLabel } from "@/lib/constants/category-labels";
import { isOpenForResponses } from "@/lib/domain/request-open";
import { formatDate, formatDateTime } from "@/lib/format/danish";
import type { RequestDraftDto } from "@/lib/types/requests";
import type { ResponseDto } from "@/lib/types/responses";

type Loaded = { request: RequestDraftDto; responses: ResponseDto[] };

type State =
  | { status: "loading" }
  | { status: "ready"; data: Loaded }
  | { status: "notFound" }
  | { status: "error"; message: string };

async function loadRequest(requestId: string): Promise<State> {
  const path = encodeURIComponent(requestId);
  try {
    const [request, own] = await Promise.all([
      apiRequest<RequestDraftDto>(`/api/requests/${path}`),
      apiRequest<{ responses: ResponseDto[] }>(`/api/requests/${path}/responses`),
    ]);
    return { status: "ready", data: { request, responses: own.responses } };
  } catch (err) {
    if (err instanceof ApiRequestError && err.code === "NOT_FOUND") return { status: "notFound" };
    return { status: "error", message: apiErrorMessage(err) };
  }
}

export function dentistNameOf(response: ResponseDto): string {
  if (!response.dentist) return "Tandlæge";
  return response.dentist.title ? `${response.dentist.title} ${response.dentist.fullName}` : response.dentist.fullName;
}

const DECISION_FLASH: Record<Decision, string> = {
  chosen: "Du har valgt tandlægen. Forespørgslen er nu lukket.",
  declined: "Svaret er afvist.",
};

// Patientens forespørgsel med alle svar på den. Patienten ser svar på sin egen forespørgsel, aldrig andres forespørgsler.
// Ingen "X andre har svaret"-tal. Valg af svar er bekræftet først og lukker forespørgslen ved valg (architecture 6.2, 5.3).
export function PatientResponses({ requestId }: { requestId: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadRequest(requestId).then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, [requestId, reloadKey]);

  // Efter et valg: hent igen og vis en bekræftelse. Ved forældet tilstand: hent igen uden bekræftelse.
  function changed(message?: string) {
    setFlash(message ?? null);
    setReloadKey((key) => key + 1);
  }

  if (state.status === "loading") {
    return (
      <p role="status" className="text-base text-ink-muted">
        Indlæser svar …
      </p>
    );
  }

  if (state.status === "notFound") {
    return (
      <Alert tone="warning" title="Forespørgslen blev ikke fundet">
        <p>Den findes ikke, eller den tilhører ikke din konto.</p>
      </Alert>
    );
  }

  if (state.status === "error") {
    return (
      <Alert tone="danger" role="alert" title="Svarene kunne ikke hentes">
        {state.message}
      </Alert>
    );
  }

  const { request, responses } = state.data;
  const open = isOpenForResponses(request.status, request.expiresAt);
  const chosen = responses.find((response) => response.patientDecision === "chosen") ?? null;

  return (
    <>
      <PageIntro title="Svar på din forespørgsel">
        <p>
          {categoryLabel(request.category)}
          {request.sentAt ? `. Sendt ${formatDate(request.sentAt)}.` : ". Forespørgslen er endnu ikke sendt."}
        </p>
      </PageIntro>

      {flash && (
        <Alert tone="success" role="status">
          {flash}
        </Alert>
      )}

      {chosen ? (
        <Alert tone="success" title={`Du har valgt ${dentistNameOf(chosen)}`}>
          <p>Forespørgslen er lukket. De øvrige svar kan ikke længere vælges.</p>
        </Alert>
      ) : (
        request.status !== "draft" &&
        !open &&
        responses.length > 0 && (
          <Alert tone="info">
            <p>Forespørgslen er ikke længere åben, så du kan ikke vælge et svar.</p>
          </Alert>
        )
      )}

      <AiDisclaimer />

      <p className="text-base leading-relaxed text-ink-muted">
        Priserne og vurderingerne er tandlægernes egne. Et prisoverslag er ikke en endelig pris, før tandlægen har
        undersøgt dig.
      </p>

      {responses.length === 0 ? (
        <Card>
          <p className="text-base leading-relaxed text-ink-muted">
            Ingen tandlæger har svaret endnu. Svar vises her, så snart de kommer ind. Opdater siden for at se nye svar.
          </p>
        </Card>
      ) : (
        <ul aria-label="Svar fra tandlæger" className="flex flex-col gap-6">
          {responses.map((response) => {
            const withdrawn = response.withdrawn || response.status === "withdrawn";
            const canDecide =
              open && chosen === null && !withdrawn && response.patientDecision === "none";
            return (
              <li key={response.id}>
                <ResponseCard
                  response={response}
                  canDecide={canDecide}
                  onDecided={(decision) => changed(DECISION_FLASH[decision])}
                  onStale={() => changed()}
                />
              </li>
            );
          })}
        </ul>
      )}

      <LinkButton href="/patient" variant="secondary" className="w-full sm:w-auto sm:self-start">
        Til mine forespørgsler
      </LinkButton>
    </>
  );
}

function ResponseCard({
  response,
  canDecide,
  onDecided,
  onStale,
}: {
  response: ResponseDto;
  canDecide: boolean;
  onDecided: (decision: Decision) => void;
  onStale: () => void;
}) {
  const withdrawn = response.withdrawn || response.status === "withdrawn";
  const name = dentistNameOf(response);
  const clinic = response.dentist?.clinicName
    ? [response.dentist.clinicName, response.dentist.clinicCity].filter(Boolean).join(", ")
    : null;
  const updated = response.updatedAt !== response.createdAt;
  const chosen = response.patientDecision === "chosen";
  const declined = response.patientDecision === "declined";

  return (
    <Card
      className={chosen ? "flex flex-col gap-6 border-brand-600 ring-1 ring-brand-600" : "flex flex-col gap-6"}
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">{name}</h2>
          <div className="flex flex-wrap gap-2">
            {withdrawn && <Badge tone="warning">Trukket tilbage af tandlægen</Badge>}
            {chosen && <Badge tone="brand">Valgt af dig</Badge>}
            {declined && <Badge tone="neutral">Afvist af dig</Badge>}
          </div>
        </div>
        {clinic && <p className="text-base text-ink-muted">{clinic}</p>}
      </div>

      {withdrawn ? (
        <Alert tone="info" title="Trukket tilbage af tandlægen">
          <p>Tandlægen har trukket dette svar tilbage, så det kan ikke vælges.</p>
        </Alert>
      ) : (
        <ResponseDetails response={response} />
      )}

      {canDecide && (
        <DecisionControls
          response={response}
          dentistName={name}
          onDecided={onDecided}
          onStale={onStale}
        />
      )}

      <p className="border-t border-line pt-4 text-sm text-ink-muted">
        Svar modtaget {formatDateTime(response.createdAt)}
        {updated && !withdrawn ? `. Senest ændret ${formatDateTime(response.updatedAt)}` : ""}
      </p>
    </Card>
  );
}
