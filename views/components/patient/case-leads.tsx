"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { CASE_STATUS_LABEL, CASE_TIMEFRAME_LABEL } from "@/lib/constants/cases";
import { LEAD_DECLINE_REASON_LABEL, LEAD_STATUS_LABEL, QUOTED_PRICE_LABEL, REMOVED_CLINIC_LABEL } from "@/lib/constants/leads";
import { MAX_ACTIVE_LEADS_PER_CASE } from "@/lib/constants/limits";
import type { PatientLeadDto } from "@/lib/types/leads";
import { PRICE_SOURCE } from "@/views/components/clinic-directory/clinic-facts";
import { Alert } from "@/views/components/ui/alert";
import { Badge, type BadgeTone } from "@/views/components/ui/badge";
import { Button, LinkButton } from "@/views/components/ui/button";
import { Card } from "@/views/components/ui/card";
import { ICONS } from "@/views/components/ui/icons";
import { LoadState } from "@/views/components/ui/load-state";
import { StatusMessage } from "@/views/components/ui/status-message";
import { apiRequest } from "@/views/utils/api-client";
import { caseFlowHref, clinicsHref } from "@/views/utils/case-links";
import { formatDate, formatPriceRange } from "@/views/utils/format";
import { loadCaseSelection } from "@/views/utils/use-case-selection";
import { useAction } from "@/views/utils/use-action";
import { useLoad } from "@/views/utils/use-load";

const STATUS_TONE: Record<PatientLeadDto["status"], BadgeTone> = {
  sent: "warning",
  accepted: "brand",
  booked: "brand",
  declined: "neutral",
  withdrawn: "neutral",
};

function LeadCard({ lead, onWithdrawn }: { lead: PatientLeadDto; onWithdrawn: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const withdraw = useAction();
  const { clinic } = lead;

  async function withdrawLead() {
    const ok = await withdraw.run(async () => {
      await apiRequest(`/api/leads/${lead.id}/withdraw`, { method: "POST", body: {} });
    });
    if (ok) onWithdrawn();
    else setConfirming(false);
  }

  return (
    <li>
      <article className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5" data-testid="lead">
        <div className="flex items-start gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-control bg-brand-50 text-brand-700">
            {clinic.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Offentlig URL fra storage; ingen next/image-optimering i prototypen.
              <img src={clinic.logoUrl} alt="" className="size-full object-contain p-2" loading="lazy" />
            ) : (
              <span className="[&_svg]:size-8">{ICONS.clinic}</span>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-lg font-semibold leading-snug text-ink">
              {clinic.removed ? REMOVED_CLINIC_LABEL : clinic.name}
            </h2>
            {!clinic.removed && <p className="text-sm text-ink-muted">{clinic.city}</p>}
            <div>
              <Badge tone={STATUS_TONE[lead.status]}>{LEAD_STATUS_LABEL[lead.status]}</Badge>
            </div>
          </div>
        </div>

        <p className="text-sm text-ink-muted">Sendt {formatDate(lead.sentAt)}</p>

        {(lead.listPrice || lead.quotedPrice) && (
          <div className="flex flex-col gap-1">
            {lead.listPrice && (
              <p className="text-base text-ink">
                <span className="font-semibold">{formatPriceRange(lead.listPrice.min, lead.listPrice.max)}</span>{" "}
                <span className="text-ink-muted">{PRICE_SOURCE}</span>
              </p>
            )}
            {lead.quotedPrice && (
              <p className="text-base text-ink">
                <span className="font-semibold">{formatPriceRange(lead.quotedPrice.min, lead.quotedPrice.max)}</span>{" "}
                <span className="text-ink-muted">{QUOTED_PRICE_LABEL}</span>
              </p>
            )}
          </div>
        )}

        {lead.clinicComment && (
          <blockquote className="rounded-control bg-surface-muted p-3 text-base text-ink">
            <p className="mb-1 text-sm font-semibold text-ink-muted">Klinikkens kommentar</p>
            {lead.clinicComment}
          </blockquote>
        )}
        {lead.status === "declined" && lead.declineReason && (
          <p className="text-base text-ink-muted">{LEAD_DECLINE_REASON_LABEL[lead.declineReason]}</p>
        )}
        {lead.status === "sent" && (
          <p className="text-sm text-ink-muted">Klinikken har ikke svaret endnu. Klinikken laver den endelige vurdering.</p>
        )}

        <StatusMessage message={withdraw.message} />

        {lead.status === "sent" &&
          (confirming ? (
            <div className="flex flex-col gap-2 sm:flex-row" role="group" aria-label={`Bekræft tilbagetrækning til ${clinic.name}`}>
              <Button variant="danger" onClick={withdrawLead} disabled={withdraw.busy}>
                {withdraw.busy ? "Trækker tilbage …" : "Ja, træk tilbage"}
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)} disabled={withdraw.busy}>
                Annuller
              </Button>
            </div>
          ) : (
            <div>
              <Button variant="danger-outline" onClick={() => setConfirming(true)}>
                Træk tilbage<span className="sr-only"> henvendelsen til {clinic.removed ? "klinikken" : clinic.name}</span>
              </Button>
            </div>
          ))}
      </article>
    </li>
  );
}

// Sagen med dens leads (architecture 6.2, 10.9). Booking, beskeder og "Luk sag" kommer med trin 5-6.
export function CaseLeads({ caseId }: { caseId: string }) {
  const loader = useCallback(() => loadCaseSelection(caseId), [caseId]);
  const { data, loading, error, errorCode, reload } = useLoad(loader);

  if (!data) {
    return (
      <>
        <LoadState loading={loading} error={error} onRetry={reload} />
        {errorCode === "NOT_FOUND" && (
          <Link href="/patient" className="font-semibold text-brand-700">
            Til mine sager
          </Link>
        )}
      </>
    );
  }

  const { caseDto, leads, activeCount, slots } = data;
  // Serverens canSend tager højde for status, opsummering og begge lofter.
  const canContactMore = caseDto.canSend;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/patient" className="inline-flex min-h-11 w-fit items-center font-semibold text-brand-700">
        ← Mine sager
      </Link>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={caseDto.status === "closed" ? "neutral" : "brand"}>{CASE_STATUS_LABEL[caseDto.status]}</Badge>
          {caseDto.isEmergency && <Badge tone="warning">Akut</Badge>}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Din sag</h1>
        {caseDto.services.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Behandlinger">
            {caseDto.services.map((service) => (
              <li key={service.id}>
                <Badge tone="brand">{service.name}</Badge>
              </li>
            ))}
          </ul>
        )}
        <p className="text-base text-ink-muted">
          {caseDto.preferredTimeframe && `${CASE_TIMEFRAME_LABEL[caseDto.preferredTimeframe]}`}
          {caseDto.preferredTimeframe && caseDto.postalCode && " · "}
          {caseDto.postalCode && `Postnummer ${caseDto.postalCode}`}
        </p>
      </header>

      {caseDto.status === "draft" && (
        <Alert tone="info" title="Sagen er ikke sendt endnu">
          <p>Du kan færdiggøre beskrivelsen og vælge klinikker.</p>
          <LinkButton href={caseFlowHref(caseId)} variant="secondary" className="mt-3">
            Fortsæt sagen
          </LinkButton>
        </Alert>
      )}

      <section aria-labelledby="henvendelser" className="flex flex-col gap-4">
        <h2 id="henvendelser" className="text-xl font-semibold text-ink">
          Henvendelser til klinikker ({leads.length})
        </h2>
        {leads.length === 0 ? (
          <p className="text-base text-ink-muted">Sagen er ikke sendt til nogen klinik endnu.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {leads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} onWithdrawn={reload} />
            ))}
          </ul>
        )}
      </section>

      {canContactMore && (
        <Card className="flex flex-col gap-3 p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-ink">Vil du kontakte flere klinikker?</h2>
          <p className="text-base text-ink-muted">
            En sag kan have op til {MAX_ACTIVE_LEADS_PER_CASE} aktive henvendelser ad gangen. Du har {activeCount} nu og kan kontakte{" "}
            {slots} klinik{slots === 1 ? "" : "ker"} mere.
          </p>
          <LinkButton href={clinicsHref(caseDto)} className="w-full sm:w-fit">
            Kontakt flere klinikker
          </LinkButton>
        </Card>
      )}
    </div>
  );
}
