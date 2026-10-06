"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { apiRequest } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/error-messages";
import { categoryLabel } from "@/lib/constants/category-labels";
import { REQUEST_STATUS_LABEL } from "@/lib/constants/inbox-labels";
import { formatDate } from "@/lib/format/danish";
import type { RequestListItemDto } from "@/lib/types/requests";

type State =
  | { status: "loading" }
  | { status: "ready"; requests: RequestListItemDto[] }
  | { status: "error"; message: string };

// Patientens egne forespørgsler. Kladder fortsættes i wizarden, sendte forespørgsler åbnes for at se svar.
export function PatientRequestList() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let active = true;
    apiRequest<{ requests: RequestListItemDto[] }>("/api/requests")
      .then(({ requests }) => {
        if (active) setState({ status: "ready", requests });
      })
      .catch((err: unknown) => {
        if (active) setState({ status: "error", message: apiErrorMessage(err) });
      });
    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <p role="status" className="text-base text-ink-muted">
        Indlæser dine forespørgsler …
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <Alert tone="danger" role="alert" title="Forespørgslerne kunne ikke hentes">
        {state.message}
      </Alert>
    );
  }

  if (state.requests.length === 0) {
    return (
      <Card>
        <p className="text-base leading-relaxed text-ink-muted">
          Du har ikke sendt nogen forespørgsler endnu. Når du har sendt en, vises den her, med status og svar.
        </p>
        <LinkButton href="/patient/forespoergsel/ny" className="mt-5 w-full sm:w-auto">
          Start ny forespørgsel
        </LinkButton>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ul aria-label="Mine forespørgsler" className="flex flex-col gap-4">
        {state.requests.map((request) => (
          <li key={request.id}>
            <Card className="flex flex-col gap-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-ink">{categoryLabel(request.category)}</h2>
                <Badge tone={request.status === "draft" ? "warning" : "neutral"}>
                  {REQUEST_STATUS_LABEL[request.status]}
                </Badge>
              </div>
              <p className="text-base text-ink-muted">
                {request.sentAt ? `Sendt ${formatDate(request.sentAt)}` : "Ikke sendt endnu"}
                {request.status !== "draft" && ` · ${responseText(request.responseCount)}`}
              </p>
              {request.status === "draft" ? (
                <Link href={`/start/${request.id}`} className="text-base font-semibold text-brand-700">
                  Fortsæt forespørgslen
                </Link>
              ) : (
                <Link href={`/patient/forespoergsel/${request.id}`} className="text-base font-semibold text-brand-700">
                  Se forespørgslen og svar
                </Link>
              )}
            </Card>
          </li>
        ))}
      </ul>
      <LinkButton href="/patient/forespoergsel/ny" variant="secondary" className="w-full sm:w-auto sm:self-start">
        Start ny forespørgsel
      </LinkButton>
    </div>
  );
}

function responseText(count: number): string {
  if (count === 0) return "Ingen svar endnu";
  return count === 1 ? "1 svar" : `${count} svar`;
}
