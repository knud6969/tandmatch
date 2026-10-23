"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CLINIC_LEAD_STATUS_LABEL, WITHDRAWN_LEAD_TEXT } from "@/lib/leads/constants/leads";
import type { ClinicLeadListItemDto, LeadStatus } from "@/lib/leads/types/leads";
import { LeadBadges, leadAreaText, leadDistanceText, leadImagesText, leadTimeText } from "@/features/leads/components/lead-facts";
import { FilterChips } from "@/components/ui/filter-chips";
import { LoadState } from "@/components/ui/load-state";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { clinicLeadHref } from "@/features/leads/utils/clinic-links";
import { formatDateTime } from "@/platform/ui-utils/format";
import { useLoad } from "@/platform/ui-utils/use-load";

type Filter = LeadStatus | "all";

// Under 30 sekunder, så et lead fra appen ses uden genindlæsning.
const LEADS_POLL_MS = 20_000;

const loadLeads = async () => (await apiRequest<{ leads: ClinicLeadListItemDto[] }>("/api/leads")).leads;

function LeadRow({ lead }: { lead: ClinicLeadListItemDto }) {
  const withdrawn = lead.status === "withdrawn";
  const title = withdrawn ? "Henvendelse" : lead.serviceNames.join(", ") || "Henvendelse";
  const facts = withdrawn
    ? []
    : [
        leadAreaText(lead),
        leadDistanceText(lead),
        lead.requestedStartsAt ? `Ønsker tid ${leadTimeText(lead)}` : leadTimeText(lead),
        leadImagesText(lead.imageCount),
      ].filter(
        (value): value is string => Boolean(value),
      );

  return (
    <li>
      <Link
        href={clinicLeadHref(lead.id)}
        data-testid="lead-raekke"
        className="flex min-h-12 flex-col gap-2 rounded-card border border-line bg-surface p-4 no-underline shadow-card transition-colors hover:border-brand-400 sm:p-5"
      >
        <LeadBadges lead={lead} />
        <span className="text-lg font-semibold leading-snug text-ink">{title}</span>
        {withdrawn ? (
          <span className="text-base text-ink-muted">{WITHDRAWN_LEAD_TEXT}</span>
        ) : (
          facts.length > 0 && <span className="text-base text-ink-muted">{facts.join(" · ")}</span>
        )}
        <span className="text-sm text-ink-muted">Modtaget {formatDateTime(lead.sentAt)}</span>
      </Link>
    </li>
  );
}

// Klinikkens indbakke (architecture 6.3): henvendelser i API'ets rækkefølge (akut først), med filter på status. En klinik, der
// ikke er verificeret, får en kort tekst i stedet for en fejl.
export function LeadInbox() {
  const { data, error, errorCode, loading, reload } = useLoad(loadLeads, { pollMs: LEADS_POLL_MS });
  const [filter, setFilter] = useState<Filter | null>(null);
  // Standardfilteret vælges én gang ved første visning, så en ny henvendelse ved opdatering ikke skifter visning under brugeren.
  const [autoFilter, setAutoFilter] = useState<Filter | null>(null);
  const waiting = data ? data.filter((lead) => lead.status === "sent").length : 0;

  // Antal ubesvarede i fanens titel, så det ses, selv når klinikken er i en anden fane.
  useEffect(() => {
    if (!data) return;
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = waiting > 0 ? `(${waiting}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [data, waiting]);

  // Forklaringen om verificering står i VerificationBanner på samme side; her kun en kort tekst, ikke endnu en advarsel.
  if (errorCode === "CLINIC_NOT_VERIFIED") {
    return (
      <p className="text-base text-ink-muted" data-testid="henvendelser-ikke-verificeret">
        Der er ingen henvendelser, før klinikken er verificeret.
      </p>
    );
  }
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;

  // API'ets rækkefølge bruges: venter på svar først, derefter akut, derefter nyeste.
  const count = (status: LeadStatus) => data.filter((lead) => lead.status === status).length;
  // Står der noget og venter, vises det først; ellers alle.
  if (autoFilter === null) setAutoFilter(count("sent") > 0 ? "sent" : "all");
  const active: Filter = filter ?? autoFilter ?? "all";
  const shown = active === "all" ? data : data.filter((lead) => lead.status === active);
  const options = [
    { value: "sent", label: `Nye (${count("sent")})` },
    { value: "accepted", label: `${CLINIC_LEAD_STATUS_LABEL.accepted} (${count("accepted")})` },
    { value: "booked", label: `${CLINIC_LEAD_STATUS_LABEL.booked} (${count("booked")})` },
    { value: "declined", label: `${CLINIC_LEAD_STATUS_LABEL.declined} (${count("declined")})` },
    { value: "withdrawn", label: `${CLINIC_LEAD_STATUS_LABEL.withdrawn} (${count("withdrawn")})` },
    { value: "all", label: `Alle (${data.length})` },
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-base font-semibold text-ink" role="status" data-testid="ubesvarede">
        {waiting === 0 ? "Ingen henvendelser venter på svar" : waiting === 1 ? "1 henvendelse venter på svar" : `${waiting} henvendelser venter på svar`}
      </p>
      <FilterChips label="Vis henvendelser" options={options} value={active} onChange={setFilter} />
      {shown.length === 0 ? (
        <p className="text-base text-ink-muted" data-testid="ingen-henvendelser">
          {data.length === 0
            ? "Der er ingen henvendelser endnu. Når en patient kontakter jer, dukker den op her."
            : "Ingen henvendelser med den status."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Henvendelser">
          {shown.map((lead) => (
            <LeadRow key={lead.id} lead={lead} />
          ))}
        </ul>
      )}
    </div>
  );
}
