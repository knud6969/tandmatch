"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { LEAD_DECLINE_REASON_LABEL, WITHDRAWN_LEAD_TEXT } from "@/lib/constants/leads";
import type { ClinicLeadDetailDto } from "@/lib/types/leads";
import { PRICE_SOURCE } from "@/views/components/clinic-directory/clinic-facts";
import { LeadBadges, leadAreaText, leadDistanceText, leadImagesText, leadTimeText } from "@/views/components/clinic/lead-facts";
import { LeadDecision } from "@/views/components/clinic/lead-decision";
import { MessageThread } from "@/views/components/messages/message-thread";
import { Alert } from "@/views/components/ui/alert";
import { Badge } from "@/views/components/ui/badge";
import { Card } from "@/views/components/ui/card";
import { DefinitionList, type DefinitionItem } from "@/views/components/ui/definition-list";
import { LoadState } from "@/views/components/ui/load-state";
import { apiRequest } from "@/views/utils/api-client";
import { formatDateTime, formatPriceRange, formatShortDateTime } from "@/views/utils/format";
import { useLoad } from "@/views/utils/use-load";

function BackLink() {
  return (
    <Link href="/klinik" className="inline-flex min-h-11 w-fit items-center font-semibold text-brand-700">
      ← Henvendelser
    </Link>
  );
}

function factItems(lead: ClinicLeadDetailDto): DefinitionItem[] {
  const items: (DefinitionItem | null)[] = [
    { label: "Område", value: leadAreaText(lead) ?? "Ikke oplyst" },
    { label: "Afstand", value: leadDistanceText(lead) ?? "Ikke oplyst" },
    { label: lead.requestedStartsAt ? "Ønsket tid" : "Ønsket tidsrum", value: leadTimeText(lead) ?? "Ikke oplyst" },
    {
      label: "Listepris for behandlingerne",
      value: lead.listPrice ? (
        <>
          <span className="font-semibold">{formatPriceRange(lead.listPrice.min, lead.listPrice.max)}</span>{" "}
          <span className="text-ink-muted">{PRICE_SOURCE}</span>
        </>
      ) : (
        "Ikke angivet i din prisliste"
      ),
    },
    { label: "Modtaget", value: formatDateTime(lead.sentAt) },
    leadImagesText(lead.imageCount) ? { label: "Billeder", value: leadImagesText(lead.imageCount) } : null,
  ];
  return items.filter((item): item is DefinitionItem => item !== null);
}

function DecisionSummary({ lead }: { lead: ClinicLeadDetailDto }) {
  const { decision } = lead;
  if (!decision) return null;
  const declined = lead.status === "declined";
  return (
    <section aria-labelledby="dit-svar" className="flex flex-col gap-3" data-testid="dit-svar">
      <h2 id="dit-svar" className="text-xl font-semibold text-ink">
        Dit svar
      </h2>
      <p className="text-base text-ink">
        {declined ? "Du har afvist henvendelsen" : "Du har accepteret henvendelsen"} {formatShortDateTime(decision.respondedAt)}.
      </p>
      {declined && decision.declineReason && <p className="text-base text-ink">{LEAD_DECLINE_REASON_LABEL[decision.declineReason]}</p>}
      {decision.declineNote && <p className="text-base text-ink-muted">Note: {decision.declineNote}</p>}
      {decision.comment && (
        <blockquote className="rounded-control bg-surface-muted p-3 text-base text-ink">
          <p className="mb-1 text-sm font-semibold text-ink-muted">Din kommentar</p>
          {decision.comment}
        </blockquote>
      )}
      {decision.quotedPrice && (
        <p className="text-base text-ink">
          <span className="font-semibold">{formatPriceRange(decision.quotedPrice.min, decision.quotedPrice.max)}</span>{" "}
          <span className="text-ink-muted">præciseret pris</span>
        </p>
      )}
      {lead.status === "accepted" && !lead.booking && (
        <p className="text-sm text-ink-muted">Patienten kan nu booke en tid i din kalender.</p>
      )}
    </section>
  );
}

function BookingContact({ lead }: { lead: ClinicLeadDetailDto }) {
  const booking = lead.booking;
  if (!booking?.contact) {
    return (
      <p className="text-sm text-ink-muted" data-testid="kontakt-skjult">
        Patientens navn og kontaktoplysninger vises først, når henvendelsen er accepteret og en tid er booket.
      </p>
    );
  }
  return (
    <section aria-labelledby="patient-kontakt" className="flex flex-col gap-2" data-testid="patient-kontakt">
      <h2 id="patient-kontakt" className="text-xl font-semibold text-ink">
        Patientens kontaktoplysninger
      </h2>
      <p className="text-base text-ink-muted">Tid: {formatShortDateTime(booking.startsAt)}</p>
      <DefinitionList
        items={[
          { label: "Navn", value: booking.contact.name },
          { label: "Telefon", value: booking.contact.phone },
          { label: "E-mail", value: booking.contact.email },
        ]}
      />
    </section>
  );
}

function LeadBody({ lead, onDecided, onStale }: { lead: ClinicLeadDetailDto; onDecided: (lead: ClinicLeadDetailDto) => void; onStale: () => void }) {
  const title = lead.services.map((s) => s.name).join(", ") || "Henvendelse";
  const pending = lead.status === "sent";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-6">
        <Card className="flex flex-col gap-5 p-4 sm:p-6" aria-labelledby="behov">
          <div className="flex flex-col gap-2">
            <LeadBadges lead={lead} />
            <h1 id="behov" className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {title}
            </h1>
          </div>

          <DefinitionList items={factItems(lead)} />

          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-ink">Behandlinger patienten har valgt</h2>
            <ul className="flex flex-wrap gap-2" aria-label="Behandlinger">
              {lead.services.map((service) => (
                <li key={service.id}>
                  <Badge tone="brand">{service.name}</Badge>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-ink">Patientens opsummering</h2>
            {lead.summaryAiAssisted && (
              <div>
                <Badge tone="neutral">Lavet med hjælp fra AI</Badge>
              </div>
            )}
            <p className="whitespace-pre-line text-base leading-relaxed text-ink" data-testid="opsummering">
              {lead.summaryText}
            </p>
            <p className="text-sm text-ink-muted">
              {lead.summaryAiAssisted
                ? "Opsummeringen er udarbejdet med hjælp fra AI og godkendt af patienten. Den er foreløbig, og I laver den endelige vurdering."
                : "Opsummeringen er skrevet og godkendt af patienten. Den er foreløbig, og I laver den endelige vurdering."}
            </p>
          </div>
        </Card>

        {lead.images.length > 0 && (
          <section aria-labelledby="billeder" className="flex flex-col gap-3">
            <h2 id="billeder" className="text-xl font-semibold text-ink">
              Billeder fra patienten
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {lead.images.map((image) => (
                <li key={image.id} className="flex flex-col gap-2 overflow-hidden rounded-card border border-line bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Signeret URL fra storage; ingen next/image-optimering i prototypen. */}
                  <img src={image.url} alt={image.approvedDescription ?? "Billede fra patienten"} className="aspect-4/3 w-full object-cover" loading="lazy" />
                  <p className="px-3 pb-3 text-sm text-ink-muted">
                    {image.approvedDescription ?? "Ingen beskrivelse delt med klinikken."}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        {pending ? <LeadDecision leadId={lead.id} onDecided={onDecided} onStale={onStale} /> : <DecisionSummary lead={lead} />}
        <BookingContact lead={lead} />
        <section aria-labelledby="beskeder" className="flex flex-col gap-3">
          <h2 id="beskeder" className="text-xl font-semibold text-ink">
            Beskeder
          </h2>
          <MessageThread
            leadId={lead.id}
            viewer="clinic"
            closed={lead.status === "declined"}
            hint="Patienten kan se dine beskeder, din kommentar og afvisningsnoten. Skriv kun det, der hjælper dig med at vurdere henvendelsen."
          />
        </section>
      </div>
    </div>
  );
}

// Lead-kortet (architecture 6.3): ét overblik over henvendelsen og svarknapperne. At åbne kortet markerer leadet som set.
export function LeadCard({ leadId }: { leadId: string }) {
  const loader = useCallback(() => apiRequest<ClinicLeadDetailDto>(`/api/leads/${leadId}`), [leadId]);
  const { data, error, loading, reload } = useLoad(loader);
  const [decided, setDecided] = useState<ClinicLeadDetailDto | null>(null);
  const lead = decided ?? data;

  const refetch = useCallback(() => {
    setDecided(null);
    reload();
  }, [reload]);

  if (!lead) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <LoadState loading={loading} error={error} onRetry={reload} />
      </div>
    );
  }

  if (lead.status === "withdrawn") {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Henvendelse</h1>
        <Alert tone="info" title="Trukket tilbage">
          <p data-testid="tilbagetrukket">{WITHDRAWN_LEAD_TEXT}</p>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <BackLink />
      <LeadBody lead={lead} onDecided={setDecided} onStale={refetch} />
    </div>
  );
}
