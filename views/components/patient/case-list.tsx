"use client";

import Link from "next/link";
import { CASE_STATUS_LABEL } from "@/lib/constants/cases";
import { LEAD_STATUS_LABEL, REMOVED_CLINIC_LABEL } from "@/lib/constants/leads";
import type { CaseListItemDto } from "@/lib/types/cases";
import { Badge } from "@/views/components/ui/badge";
import { LinkButton } from "@/views/components/ui/button";
import { Card } from "@/views/components/ui/card";
import { LoadState } from "@/views/components/ui/load-state";
import { apiRequest } from "@/views/utils/api-client";
import { caseFlowHref, caseHref } from "@/views/utils/case-links";
import { formatDate, formatDateTime } from "@/views/utils/format";
import { useLoad } from "@/views/utils/use-load";

const loadCases = async (): Promise<CaseListItemDto[]> => (await apiRequest<{ cases: CaseListItemDto[] }>("/api/cases")).cases;

function CaseItem({ item }: { item: CaseListItemDto }) {
  const draft = item.status === "draft";
  const title = item.serviceNames.length > 0 ? item.serviceNames.join(", ") : "Sag uden valgte behandlinger";
  return (
    <li>
      <Card className="flex flex-col gap-3 p-4 sm:p-5" data-testid="sag">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={draft ? "warning" : "brand"}>{CASE_STATUS_LABEL[item.status]}</Badge>
          {item.isEmergency && <Badge tone="warning">Akut</Badge>}
          {item.submittedAt && <span className="text-sm text-ink-muted">Sendt {formatDate(item.submittedAt)}</span>}
        </div>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {item.leads.length > 0 ? (
          <ul className="flex flex-col gap-1.5" aria-label="Klinikker, sagen er sendt til">
            {item.leads.map((lead) => (
              <li key={lead.id} className="flex flex-wrap items-center justify-between gap-2 text-base">
                <span className="min-w-0 truncate text-ink">{lead.removed ? REMOVED_CLINIC_LABEL : lead.clinicName || "Klinik"}</span>
                <Badge tone={lead.status === "declined" || lead.status === "withdrawn" ? "neutral" : "brand"}>
                  {LEAD_STATUS_LABEL[lead.status]}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-base text-ink-muted">
            {draft ? "Sagen er ikke sendt endnu." : "Sagen er ikke sendt til nogen klinik."}
          </p>
        )}
        {item.nextBooking && (
          <p className="rounded-control bg-brand-50 px-3 py-2 text-base text-brand-900" data-testid="naeste-booking">
            <span className="font-semibold">Næste tid:</span> {formatDateTime(item.nextBooking.startsAt)} hos {item.nextBooking.clinicName}
          </p>
        )}
        <div>
          {draft ? (
            <LinkButton href={caseFlowHref(item.id)} variant="secondary">
              Fortsæt sagen
            </LinkButton>
          ) : (
            <LinkButton href={caseHref(item.id)} variant="secondary">
              Se sagen
            </LinkButton>
          )}
        </div>
      </Card>
    </li>
  );
}

// Patientens sager (architecture 6.2): status, leads pr. sag og sagens næste booking.
export function CaseList() {
  const { data, loading, error, reload } = useLoad(loadCases);
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;
  if (data.length === 0) {
    return (
      <Card className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-ink">Du har ingen sager endnu</h2>
        <p className="text-base text-ink-muted">
          Beskriv dit problem, så hjælper vi dig med at finde klinikker. Du kan også gå direkte til{" "}
          <Link href="/klinikker" className="font-semibold text-brand-700">
            oversigten over klinikker
          </Link>
          .
        </p>
        <LinkButton href="/start" className="w-full sm:w-fit">
          Beskriv dit problem
        </LinkButton>
      </Card>
    );
  }
  return (
    <ul className="flex flex-col gap-4" aria-label="Dine sager">
      {data.map((item) => (
        <CaseItem key={item.id} item={item} />
      ))}
    </ul>
  );
}
