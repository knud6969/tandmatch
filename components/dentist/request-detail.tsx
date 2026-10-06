"use client";

import { useEffect, useState } from "react";
import { AiDisclaimer } from "@/components/ui/disclaimer";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DefinitionList } from "@/components/ui/definition-list";
import { LinkButton } from "@/components/ui/button";
import { PageIntro } from "@/components/ui/page-intro";
import { ResponseDetails } from "@/components/responses/response-details";
import { ResponseForm } from "@/components/dentist/response-form";
import { WithdrawResponse } from "@/components/dentist/withdraw-response";
import { ApiRequestError, apiRequest } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/error-messages";
import { categoryLabel } from "@/lib/constants/category-labels";
import { REQUEST_STATUS_LABEL } from "@/lib/constants/inbox-labels";
import { isOpenForResponses } from "@/lib/domain/request-open";
import { formatDate, formatDateTime, formatKm } from "@/lib/format/danish";
import type { InboxDetailDto } from "@/lib/types/dentist";
import type { ResponseDto } from "@/lib/types/responses";

type Loaded = { detail: InboxDetailDto; response: ResponseDto | null };

type State =
  | { status: "loading" }
  | { status: "ready"; data: Loaded }
  | { status: "notFound" }
  | { status: "notVerified" }
  | { status: "error"; message: string };

// Forespørgslen hentes fra GET /api/inbox/{requestId} (opsummering kun når godkendt, svar på spørgsmål, billeder).
// Eget svar hentes fra /api/requests/{id}/responses. Tandlægen ser aldrig andre tandlægers svar (architecture 5.5).
async function loadRequest(requestId: string): Promise<State> {
  const path = encodeURIComponent(requestId);
  try {
    const [detail, own] = await Promise.all([
      apiRequest<InboxDetailDto>(`/api/inbox/${path}`),
      apiRequest<{ responses: ResponseDto[] }>(`/api/requests/${path}/responses`),
    ]);
    // Tandlægen har højst ét svar (unik i databasen). Serveren filtrerer allerede til eget svar.
    return { status: "ready", data: { detail, response: own.responses[0] ?? null } };
  } catch (err) {
    if (err instanceof ApiRequestError && err.code === "NOT_FOUND") return { status: "notFound" };
    if (err instanceof ApiRequestError && err.code === "NOT_VERIFIED") return { status: "notVerified" };
    return { status: "error", message: apiErrorMessage(err) };
  }
}

export function RequestDetail({ requestId }: { requestId: string }) {
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

  // Efter en gemt ændring: hent data igen og vis en kort bekræftelse. Ved forældet tilstand: hent igen uden bekræftelse.
  function changed(message?: string) {
    setFlash(message ?? null);
    setReloadKey((key) => key + 1);
  }

  if (state.status === "loading") {
    return (
      <>
        <BackLink />
        <p role="status" className="text-base text-ink-muted">
          Indlæser forespørgslen …
        </p>
      </>
    );
  }

  if (state.status === "notFound") {
    return (
      <>
        <BackLink />
        <Alert tone="warning" title="Forespørgslen blev ikke fundet">
          <p>Den findes ikke i din indbakke, eller du er ikke modtager af den.</p>
        </Alert>
      </>
    );
  }

  if (state.status === "notVerified") {
    return (
      <>
        <BackLink />
        <Alert tone="warning" title="Afventer verifikation">
          <p>
            Din profil er endnu ikke verificeret. Du kan se forespørgsler, når en administrator har godkendt dig, og
            derefter svare på dem.
          </p>
        </Alert>
      </>
    );
  }

  if (state.status === "error") {
    return (
      <>
        <BackLink />
        <Alert tone="danger" role="alert" title="Forespørgslen kunne ikke hentes">
          {state.message}
        </Alert>
      </>
    );
  }

  const { detail, response } = state.data;
  const open = isOpenForResponses(detail.status, detail.expiresAt);
  const area = [detail.area.postalCode, detail.area.city].filter(Boolean).join(" ") || "–";

  return (
    <>
      <BackLink />
      <PageIntro title={categoryLabel(detail.category)}>
        {detail.sentAt && detail.expiresAt && (
          <p>
            Sendt {formatDate(detail.sentAt)}. Svar senest {formatDate(detail.expiresAt)}.
          </p>
        )}
      </PageIntro>

      {flash && (
        <Alert tone="success" role="status">
          {flash}
        </Alert>
      )}

      <Card className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-ink">Forespørgslen</h2>
          <div className="flex flex-wrap gap-2">
            {open ? (
              <Badge tone="brand">Åben for svar</Badge>
            ) : (
              <Badge tone="warning">{REQUEST_STATUS_LABEL[detail.status]}</Badge>
            )}
          </div>
        </div>
        <DefinitionList
          items={[
            { label: "Område", value: area },
            { label: "Afstand", value: formatKm(detail.distanceKm) },
          ]}
        />

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-ink-muted">Patientens beskrivelse</h3>
          {detail.summaryText ? (
            <p className="whitespace-pre-line text-base leading-relaxed text-ink">{detail.summaryText}</p>
          ) : (
            <p className="rounded-lg bg-canvas p-4 text-base leading-relaxed text-ink-muted">
              Patienten har endnu ikke godkendt sin beskrivelse, så den vises ikke her.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-ink-muted">Svar på spørgsmål</h3>
          {detail.answers.length > 0 ? (
            <DefinitionList
              items={detail.answers.map((answer) => ({ label: answer.label, value: answer.values.join(", ") }))}
            />
          ) : (
            <p className="text-base text-ink-muted">Patienten har ikke svaret på spørgsmål.</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-ink-muted">Billeder</h3>
          {detail.images.length > 0 ? (
            <ul aria-label="Billeder fra patienten" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {detail.images.map((image, index) => (
                <li key={image.id}>
                  {/* Signerede Supabase-URL'er, derfor ikke next/image (ingen domæne-konfiguration). */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={`Billede ${index + 1} fra patientens forespørgsel`}
                    className="aspect-square w-full rounded-lg border border-line bg-canvas object-cover"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-base text-ink-muted">Der er ikke uploadet billeder.</p>
          )}
        </div>
      </Card>

      <Card className="flex flex-col gap-6">
        <h2 className="text-lg font-semibold text-ink">Dit svar</h2>
        <ResponseSection
          requestId={requestId}
          open={open}
          response={response}
          onChanged={changed}
        />
      </Card>

      <AiDisclaimer />
    </>
  );
}

function ResponseSection({
  requestId,
  open,
  response,
  onChanged,
}: {
  requestId: string;
  open: boolean;
  response: ResponseDto | null;
  onChanged: (message?: string) => void;
}) {
  if (!response) {
    if (!open) {
      return (
        <Alert tone="warning">
          <p>Forespørgslen er ikke længere åben for svar, så du kan ikke sende et svar.</p>
        </Alert>
      );
    }
    return (
      <>
        <p className="text-base leading-relaxed text-ink-muted">
          Svaret sendes til patienten. Du kan rette det, indtil patienten har valgt, eller du trækker det tilbage.
        </p>
        <ResponseForm
          requestId={requestId}
          onSaved={() => onChanged("Dit svar er sendt til patienten.")}
          onStale={() => onChanged()}
        />
      </>
    );
  }

  if (response.status === "withdrawn") {
    return (
      <Alert tone="info" title="Svaret er trukket tilbage">
        <p>Du har trukket dit svar tilbage. Det kan ikke ændres igen.</p>
      </Alert>
    );
  }

  if (response.patientDecision !== "none") {
    return (
      <>
        <Alert tone="info" title={response.patientDecision === "chosen" ? "Patienten har valgt dit svar" : "Patienten har valgt en anden tandlæge"}>
          <p>Svaret er låst og kan ikke ændres længere.</p>
        </Alert>
        <ResponseDetails response={response} />
      </>
    );
  }

  // Svaret er sendt og patienten har ikke valgt. Ret og træk tilbage, mens forespørgslen er åben.
  if (!open) {
    return (
      <>
        <Alert tone="warning">
          <p>Forespørgslen er ikke længere åben, så svaret kan ikke ændres.</p>
        </Alert>
        <ResponseDetails response={response} />
      </>
    );
  }

  return (
    <>
      <p className="text-base text-ink-muted">Sendt {formatDateTime(response.createdAt)}. Du kan rette svaret nedenfor.</p>
      <ResponseForm
        key={response.updatedAt}
        requestId={requestId}
        initial={response}
        onSaved={() => onChanged("Ændringerne er gemt.")}
        onStale={() => onChanged()}
      />
      <WithdrawResponse
        responseId={response.id}
        onWithdrawn={() => onChanged("Dit svar er trukket tilbage.")}
        onStale={() => onChanged()}
      />
    </>
  );
}

function BackLink() {
  return (
    <LinkButton href="/tandlaege" variant="ghost" className="self-start px-0">
      ← Til indbakken
    </LinkButton>
  );
}
