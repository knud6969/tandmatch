"use client";

import { useEffect, useState } from "react";
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
import { formatDate, formatDateTime } from "@/lib/format/danish";
import type { RequestDraftDto } from "@/lib/types/requests";
import type { ResponseDto } from "@/lib/types/responses";

type Loaded = { request: RequestDraftDto; responses: ResponseDto[] };

type State =
  | { status: "loading" }
  | { status: "ready"; data: Loaded }
  | { status: "notFound" }
  | { status: "error"; message: string };

async function loadResponses(requestId: string): Promise<State> {
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

// Patientens svar på egen forespørgsel. Patienten ser alle svar på sin forespørgsel, men ingen andres svar på andre forespørgsler.
// Der vises ingen antal-tal over andre tandlæger, og svar fra en anden patients forespørgsel er ikke synlige (architecture 5.5).
export function PatientResponses({ requestId }: { requestId: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let active = true;
    loadResponses(requestId).then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, [requestId]);

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

  return (
    <>
      <PageIntro title="Svar på din forespørgsel">
        <p>
          {categoryLabel(request.category)}
          {request.sentAt ? `. Sendt ${formatDate(request.sentAt)}.` : ". Forespørgslen er endnu ikke sendt."}
        </p>
      </PageIntro>

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
          {responses.map((response) => (
            <li key={response.id}>
              <ResponseCard response={response} />
            </li>
          ))}
        </ul>
      )}

      <LinkButton href="/patient" variant="secondary" className="w-full sm:w-auto sm:self-start">
        Til mine forespørgsler
      </LinkButton>
    </>
  );
}

function ResponseCard({ response }: { response: ResponseDto }) {
  const dentistName = response.dentist ? `${response.dentist.title ? `${response.dentist.title} ` : ""}${response.dentist.fullName}` : "Tandlæge";
  const clinic = response.dentist?.clinicName
    ? [response.dentist.clinicName, response.dentist.clinicCity].filter(Boolean).join(", ")
    : null;
  const updated = response.updatedAt !== response.createdAt;

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">{dentistName}</h2>
          {response.status === "withdrawn" && <Badge tone="warning">Trukket tilbage</Badge>}
        </div>
        {clinic && <p className="text-base text-ink-muted">{clinic}</p>}
      </div>

      {response.status === "withdrawn" ? (
        <Alert tone="info">
          <p>Tandlægen har trukket dette svar tilbage.</p>
        </Alert>
      ) : (
        <ResponseDetails response={response} />
      )}

      <p className="border-t border-line pt-4 text-sm text-ink-muted">
        Svar modtaget {formatDateTime(response.createdAt)}
        {updated && response.status !== "withdrawn" ? `. Senest ændret ${formatDateTime(response.updatedAt)}` : ""}
      </p>
    </Card>
  );
}
