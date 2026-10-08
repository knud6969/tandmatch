"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/views/components/ui/alert";
import { LinkButton } from "@/views/components/ui/button";
import { Card } from "@/views/components/ui/card";
import { DefinitionList } from "@/views/components/ui/definition-list";
import { apiRequest } from "@/views/utils/api-client";
import { apiErrorMessage } from "@/views/utils/api-errors";
import { formatDate, formatPriceRange } from "@/views/utils/format";
import type { EligibleVisitDto } from "@/lib/types/standard";

type State =
  | { status: "loading" }
  | { status: "ready"; items: EligibleVisitDto[] }
  | { status: "error"; message: string };

// Verificerede besøg, som patienten kan anmelde (architecture 8.1, 10.9). Anmeldelsen modereres, før den offentliggøres.
export function EligibleVisits() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let active = true;
    apiRequest<{ items: EligibleVisitDto[] }>("/api/reviews/eligible")
      .then(({ items }) => {
        if (active) setState({ status: "ready", items });
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
        Indlæser dine besøg …
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <Alert tone="danger" role="alert" title="Besøgene kunne ikke hentes">
        {state.message}
      </Alert>
    );
  }

  if (state.items.length === 0) {
    return (
      <Card>
        <p className="text-base leading-relaxed text-ink-muted">
          Du har ingen besøg, der kan anmeldes lige nu. Et besøg kan anmeldes, når det er verificeret på TandMatch.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-base leading-relaxed text-ink-muted">
        Din anmeldelse modereres, før den offentliggøres. Den vises først, når den er godkendt.
      </p>
      <ul aria-label="Besøg du kan anmelde" className="flex flex-col gap-4">
        {state.items.map((visit) => (
          <li key={visit.visitId}>
            <Card className="flex flex-col gap-4 p-5 sm:p-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold text-ink">{visit.dentistName ?? "Tandlæge"}</h2>
                {visit.clinicName && <p className="text-base text-ink-muted">{visit.clinicName}</p>}
              </div>
              <DefinitionList
                items={[
                  { label: "Besøg", value: formatDate(visit.visitedOn) },
                  ...(visit.quotedPrice
                    ? [{ label: "Prisoverslag", value: formatPriceRange(visit.quotedPrice.min, visit.quotedPrice.max) }]
                    : []),
                ]}
              />
              <LinkButton href={`/patient/anmeld/${visit.visitId}`} className="w-full sm:w-auto sm:self-start">
                Anmeld besøget
              </LinkButton>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
