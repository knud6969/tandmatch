"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LEAD_DECLINE_REASON_LABEL, WITHDRAWN_LEAD_TEXT } from "@/lib/leads/constants/leads";
import { leadNeedsAction } from "@/lib/leads/domain/leads";
import type { ClinicLeadDetailDto, ClinicLeadListItemDto } from "@/lib/leads/types/leads";
import { LeadBadges, leadFactLine } from "@/features/leads/components/lead-facts";
import { LeadDecision } from "@/features/leads/components/lead-decision";
import { LeadImages } from "@/features/leads/components/lead-images";
import { MessageThread } from "@/features/leads/components/message-thread";
import { Alert } from "@/components/ui/alert";
import { LinkButton } from "@/components/ui/button";
import { CommentQuote } from "@/components/ui/comment-quote";
import { LoadState } from "@/components/ui/load-state";
import { PriceWithSource } from "@/components/ui/price-with-source";
import { clinicLeadHref } from "@/features/leads/utils/clinic-links";
import { refreshClinicLeads, useClinicLeads, LEADS_POLL_MS } from "@/features/leads/utils/clinic-leads-store";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { formatShortDateTime } from "@/lib/common/domain/format";
import { useLoad } from "@/platform/ui-utils/use-load";

function BackLink() {
  return (
    <Link href="/klinik" className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-brand-700 lg:hidden">
      ← Henvendelser
    </Link>
  );
}

// Opsummeringen afkortet til 4 linjer med "Vis mere", når den er længere. Forbeholdet står kort under.
function Summary({ lead }: { lead: ClinicLeadDetailDto }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [lead.summaryText, expanded]);

  return (
    <section aria-labelledby="opsummering-titel" className="flex flex-col gap-1.5">
      <h2 id="opsummering-titel" className="sr-only">
        Patientens opsummering
      </h2>
      <p
        ref={ref}
        id="opsummering-tekst"
        className={expanded ? "whitespace-pre-line text-base leading-relaxed text-ink" : "line-clamp-4 whitespace-pre-line text-base leading-relaxed text-ink"}
        data-testid="opsummering"
      >
        {lead.summaryText}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls="opsummering-tekst"
          className="min-h-11 w-fit text-sm font-semibold text-brand-700"
        >
          {expanded ? "Vis mindre" : "Vis mere"}
        </button>
      )}
      <p className="text-xs text-ink-muted" data-testid="forbehold">
        Godkendt af patienten{lead.summaryAiAssisted ? " · lavet med hjælp fra AI" : ""}. Foreløbig – I laver den endelige vurdering.
      </p>
    </section>
  );
}

function DecisionSummary({ lead }: { lead: ClinicLeadDetailDto }) {
  const { decision } = lead;
  if (!decision) return null;
  const declined = lead.status === "declined";
  return (
    <section aria-labelledby="dit-svar" className="flex flex-col gap-2 border-t border-line pt-4" data-testid="dit-svar">
      <h2 id="dit-svar" className="text-base font-semibold text-ink">
        Dit svar
      </h2>
      <p className="text-sm text-ink">
        {declined ? "Du har afvist henvendelsen" : "Du har accepteret henvendelsen"} {formatShortDateTime(decision.respondedAt)}
        {declined && decision.declineReason ? `: ${LEAD_DECLINE_REASON_LABEL[decision.declineReason]}` : ""}.
      </p>
      {decision.declineNote && <p className="text-sm text-ink-muted">Note: {decision.declineNote}</p>}
      {decision.comment && <CommentQuote title="Din kommentar">{decision.comment}</CommentQuote>}
      {decision.quotedPrice && (
        <p className="text-sm text-ink">
          <PriceWithSource price={decision.quotedPrice} source="præciseret pris" />
        </p>
      )}
      {lead.status === "accepted" && (!lead.booking || lead.booking.status === "cancelled") && (
        <p className="text-xs text-ink-muted">Patienten kan nu booke en tid i din kalender.</p>
      )}
    </section>
  );
}

function BookingContact({ lead }: { lead: ClinicLeadDetailDto }) {
  const booking = lead.booking;
  if (!booking?.contact) {
    return (
      <p className="text-xs text-ink-muted" data-testid="kontakt-skjult">
        Navn og kontakt vises, når henvendelsen er accepteret og en tid er booket.
      </p>
    );
  }
  return (
    <section aria-labelledby="patient-kontakt" className="flex flex-col gap-1 rounded-card bg-surface-muted p-3" data-testid="patient-kontakt">
      <h2 id="patient-kontakt" className="text-base font-semibold text-ink">
        Patientens kontaktoplysninger
      </h2>
      <p className="text-sm text-ink">
        {booking.contact.name} · {booking.contact.phone} · {booking.contact.email}
      </p>
      <p className="text-xs text-ink-muted">Tid: {formatShortDateTime(booking.startsAt)}</p>
    </section>
  );
}

// Efter et svar: videre til det næste lead, der kræver handling (indbakkens rækkefølge, det aktuelle udeladt).
function NextLead({ remaining, justDecided }: { remaining: ClinicLeadListItemDto[]; justDecided: boolean }) {
  if (remaining.length === 0) {
    return (
      <div className="flex flex-col gap-2" data-testid="naeste">
        <p className="text-sm text-ink" role="status">
          Svaret er sendt. Intet andet kræver handling.
        </p>
        <LinkButton href="/klinik" variant="secondary" className="lg:hidden">
          Tilbage til henvendelser
        </LinkButton>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2" data-testid="naeste">
      {justDecided && (
        <p className="text-sm text-ink" role="status">
          Svaret er sendt.
        </p>
      )}
      <LinkButton href={clinicLeadHref(remaining[0].id)} fullWidth>
        Næste henvendelse ({remaining.length} tilbage)
      </LinkButton>
    </div>
  );
}

function LeadBody({ lead, justDecided, onDecided, onStale }: { lead: ClinicLeadDetailDto; justDecided: boolean; onDecided: (lead: ClinicLeadDetailDto) => void; onStale: () => void }) {
  const title = lead.services.map((s) => s.name).join(", ") || "Henvendelse";
  const pending = lead.status === "sent";
  const { data: list } = useClinicLeads();
  const remaining = (list ?? []).filter((item) => item.id !== lead.id && leadNeedsAction(item));
  // Bjælken vises, så længe der er noget at gøre: svare, eller (efter et svar) gå videre.
  const showBar = pending || justDecided || remaining.length > 0;
  const facts = leadFactLine(lead, [`Modtaget ${formatShortDateTime(lead.sentAt)}`]);
  // Første gang tråden er hentet, er leadet set og beskederne læst: listen hentes igen én gang, så prikken "ikke åbnet" og
  // tallet for ulæste forsvinder uden at vente på næste polling.
  const refreshedList = useRef(false);
  const onThreadRead = useCallback(() => {
    if (refreshedList.current) return;
    refreshedList.current = true;
    refreshClinicLeads();
  }, []);

  // DOM-rækkefølge: titel, svarbjælke, opsummering, billeder, fakta, dit svar og kontakt, beskeder. Svarbjælken står tidligt i
  // DOM, så tastaturet når den hurtigt; på mobil vises den som fast bjælke i bunden (order-last + sticky bottom-0), fra lg fast i
  // toppen af kolonnen.
  return (
    <article aria-labelledby="behov" className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <LeadBadges lead={lead} />
        <h1 id="behov" className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          {title}
        </h1>
      </header>

      {showBar && (
        <div
          className="sticky bottom-0 z-10 order-last -mx-4 max-h-[75dvh] overflow-y-auto border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-raised sm:-mx-6 sm:px-6 lg:top-0 lg:bottom-auto lg:order-none lg:mx-0 lg:rounded-card lg:border lg:px-4 lg:pb-3 lg:shadow-card"
          data-testid="svarbjaelke"
        >
          {pending ? (
            <LeadDecision leadId={lead.id} onDecided={onDecided} onStale={onStale} hasRequestedTime={lead.requestedStartsAt !== null} />
          ) : (
            <NextLead remaining={remaining} justDecided={justDecided} />
          )}
        </div>
      )}

      <Summary lead={lead} />

      {lead.images.length > 0 && <LeadImages images={lead.images} />}

      <p className="text-sm text-ink-muted" data-testid="fakta">
        {facts}
      </p>

      <DecisionSummary lead={lead} />
      <BookingContact lead={lead} />

      <section aria-labelledby="beskeder" className="flex flex-col gap-2 border-t border-line pt-4">
        <h2 id="beskeder" className="text-base font-semibold text-ink">
          Beskeder
        </h2>
        <MessageThread
          leadId={lead.id}
          viewer="clinic"
          closed={lead.status === "declined"}
          hint="Patienten kan læse dine beskeder."
          onRead={onThreadRead}
        />
      </section>
    </article>
  );
}

// Lead-kortet (features/clinics/README.md 6.3): ét overblik over henvendelsen og svarknapperne. At åbne kortet markerer leadet
// som set. Kortet henter igen hvert 20. sekund, mens fanen er synlig, så fx kontaktoplysninger dukker op efter booking.
export function LeadCard({ leadId }: { leadId: string }) {
  const loader = useCallback(() => apiRequest<ClinicLeadDetailDto>(`/api/leads/${leadId}`), [leadId]);
  const { data, error, loading, reload } = useLoad(loader, { pollMs: LEADS_POLL_MS });
  const [decided, setDecided] = useState<{ lead: ClinicLeadDetailDto; base: ClinicLeadDetailDto | null } | null>(null);
  // Svaret fra beslutningen vises, indtil en ny hentning har givet nyere data.
  const lead = decided && decided.base === data ? decided.lead : data;

  const onDecided = useCallback(
    (next: ClinicLeadDetailDto) => {
      setDecided({ lead: next, base: data });
      refreshClinicLeads();
      reload();
    },
    [data, reload],
  );

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
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">Henvendelse</h1>
        <Alert tone="info" title="Trukket tilbage">
          <p data-testid="tilbagetrukket">{WITHDRAWN_LEAD_TEXT}</p>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <BackLink />
      <LeadBody lead={lead} justDecided={decided !== null} onDecided={onDecided} onStale={refetch} />
    </div>
  );
}
