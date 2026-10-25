"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CLINIC_LEAD_STATUS_LABEL, WITHDRAWN_LEAD_TEXT } from "@/lib/leads/constants/leads";
import { leadNeedsAction } from "@/lib/leads/domain/leads";
import type { ClinicLeadListItemDto, LeadStatus } from "@/lib/leads/types/leads";
import { LeadBadges, leadFactLine, leadImagesText } from "@/features/leads/components/lead-facts";
import { FilterChips } from "@/components/ui/filter-chips";
import { LoadState } from "@/components/ui/load-state";
import { cx } from "@/components/ui/cx";
import { clinicLeadHref } from "@/features/leads/utils/clinic-links";
import {
  countNeedingAction,
  rememberedInboxFilter,
  rememberInboxFilter,
  useClinicLeads,
} from "@/features/leads/utils/clinic-leads-store";
import { formatShortDateTime } from "@/lib/common/domain/format";

const FILTERS = ["action", "sent", "accepted", "booked", "declined", "withdrawn", "all"] as const;
type Filter = (typeof FILTERS)[number];

function matches(lead: ClinicLeadListItemDto, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "action") return leadNeedsAction(lead);
  return lead.status === filter;
}

function LeadRow({ lead, selected }: { lead: ClinicLeadListItemDto; selected: boolean }) {
  const withdrawn = lead.status === "withdrawn";
  const title = withdrawn ? "Henvendelse" : lead.serviceNames.join(", ") || "Henvendelse";
  const facts = withdrawn ? "" : leadFactLine(lead, [leadImagesText(lead.imageCount)]);

  return (
    <li>
      <Link
        href={clinicLeadHref(lead.id)}
        data-testid="lead-raekke"
        aria-current={selected ? "page" : undefined}
        className={cx(
          "flex min-h-12 flex-col gap-1.5 rounded-card border bg-surface p-4 no-underline shadow-card transition-colors hover:border-brand-400",
          selected ? "border-brand-600 ring-1 ring-brand-600" : "border-line",
        )}
      >
        <LeadBadges lead={lead} />
        <span className="text-base font-semibold leading-snug text-ink">{title}</span>
        {withdrawn ? (
          <span className="text-sm text-ink-muted">{WITHDRAWN_LEAD_TEXT}</span>
        ) : (
          <>
            {lead.summaryExcerpt && (
              <span className="text-sm leading-snug text-ink" data-testid="uddrag">
                {lead.summaryExcerpt}
              </span>
            )}
            {facts && <span className="text-sm text-ink-muted">{facts}</span>}
          </>
        )}
        <span className="text-xs text-ink-muted">Modtaget {formatShortDateTime(lead.sentAt)}</span>
      </Link>
    </li>
  );
}

// Klinikkens indbakke (features/clinics/README.md 6.3): henvendelser i API'ets rækkefølge med filtre; standard er "Kræver
// handling". Data kommer fra den delte hentning, som også giver tallet på fanen. En klinik, der ikke er verificeret, får en
// kort tekst i stedet for en fejl. `selectedId` markerer det åbne lead i den brede visning.
export function LeadInbox({ selectedId }: { selectedId?: string }) {
  const { data, error, errorCode, loading, reload } = useClinicLeads();
  const needingAction = countNeedingAction(data);

  // Antal, der kræver handling, i browserfanens titel, så det ses, selv når klinikken er i en anden fane.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = needingAction > 0 ? `(${needingAction}) ${base}` : base;
    return () => {
      document.title = document.title.replace(/^\(\d+\) /, "");
    };
  }, [needingAction]);

  // Forklaringen om verificering står i VerificationBanner på /klinik; her kun en kort tekst, ikke endnu en advarsel.
  if (errorCode === "CLINIC_NOT_VERIFIED") {
    return (
      <p className="text-base text-ink-muted" data-testid="henvendelser-ikke-verificeret">
        Der er ingen henvendelser, før klinikken er verificeret.
      </p>
    );
  }
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;
  return <InboxList leads={data} selectedId={selectedId} />;
}

function initialFilter(data: ClinicLeadListItemDto[]): Filter {
  const remembered = rememberedInboxFilter();
  if (remembered && (FILTERS as readonly string[]).includes(remembered)) return remembered as Filter;
  return data.some(leadNeedsAction) ? "action" : "all";
}

// Listen med filter. Monteres først, når der er data, så standardfilteret vælges én gang (som startværdi), og en ny
// henvendelse ved opdatering ikke skifter visning under brugeren.
function InboxList({ leads: data, selectedId }: { leads: ClinicLeadListItemDto[]; selectedId?: string }) {
  const [filter, setFilterState] = useState<Filter>(() => initialFilter(data));
  const setFilter = (value: Filter) => {
    rememberInboxFilter(value);
    setFilterState(value);
  };

  const waiting = data.filter((lead) => lead.status === "sent").length;
  const count = (value: Filter) => data.filter((lead) => matches(lead, value)).length;
  // Det åbne lead bliver stående i listen, selv om det ikke længere passer til filteret (fx lige efter et svar).
  const shown = data.filter((lead) => matches(lead, filter) || lead.id === selectedId);
  const label = (value: LeadStatus) => `${CLINIC_LEAD_STATUS_LABEL[value]} (${count(value)})`;
  const options = [
    { value: "action", label: `Kræver handling (${count("action")})` },
    { value: "sent", label: label("sent") },
    { value: "accepted", label: label("accepted") },
    { value: "booked", label: label("booked") },
    { value: "declined", label: label("declined") },
    { value: "withdrawn", label: label("withdrawn") },
    { value: "all", label: `Alle (${data.length})` },
  ] as const;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-ink" role="status" data-testid="ubesvarede">
        {waiting === 0 ? "Ingen henvendelser venter på svar" : waiting === 1 ? "1 henvendelse venter på svar" : `${waiting} henvendelser venter på svar`}
      </p>
      <FilterChips label="Vis henvendelser" options={options} value={filter} onChange={setFilter} />
      {shown.length === 0 ? (
        <p className="text-base text-ink-muted" data-testid="ingen-henvendelser">
          {data.length === 0
            ? "Der er ingen henvendelser endnu. Når en patient kontakter jer, dukker den op her."
            : filter === "action"
              ? "Intet kræver handling lige nu."
              : "Ingen henvendelser med den status."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Henvendelser">
          {shown.map((lead) => (
            <LeadRow key={lead.id} lead={lead} selected={lead.id === selectedId} />
          ))}
        </ul>
      )}
    </div>
  );
}
