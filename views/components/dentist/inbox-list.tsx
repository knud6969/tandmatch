"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert } from "@/views/components/ui/alert";
import { Badge, type BadgeTone } from "@/views/components/ui/badge";
import { Card } from "@/views/components/ui/card";
import { DefinitionList } from "@/views/components/ui/definition-list";
import { FilterChips } from "@/views/components/ui/filter-chips";
import { ApiRequestError, apiRequest } from "@/views/utils/api-client";
import { apiErrorMessage } from "@/views/utils/api-errors";
import { categoryLabel } from "@/lib/constants/categories";
import { INBOX_FILTERS, RECIPIENT_STATUS_LABEL } from "@/lib/constants/inbox";
import { isOpenForResponses } from "@/lib/domain/request-open";
import { formatDate, formatKm } from "@/views/utils/format";
import type { InboxItemDto, InboxRecipientStatus } from "@/lib/types/dentists";

type Filter = InboxRecipientStatus | "alle";

// Resultatet gemmes sammen med det filter, det hører til. Så vises "Indlæser" uden at synkronisere state i effekten.
type Result =
  | { filter: Filter; items: InboxItemDto[] }
  | { filter: Filter; error: string; notVerified: boolean };

const recipientTone: Record<InboxRecipientStatus, BadgeTone> = {
  new: "brand",
  seen: "neutral",
  responded: "neutral",
  declined: "neutral",
};

// Indbakken viser kun kategori, område, afstand, billedantal og datoer. Ingen patientnavn eller kontaktinfo (architecture 4.4).
export function InboxList() {
  const [filter, setFilter] = useState<Filter>("alle");
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let active = true;
    const path = filter === "alle" ? "/api/inbox" : `/api/inbox?status=${filter}`;
    apiRequest<{ items: InboxItemDto[] }>(path)
      .then(({ items }) => {
        if (active) setResult({ filter, items });
      })
      .catch((err: unknown) => {
        if (!active) return;
        setResult({
          filter,
          error: apiErrorMessage(err),
          notVerified: err instanceof ApiRequestError && err.code === "NOT_VERIFIED",
        });
      });
    return () => {
      active = false;
    };
  }, [filter]);

  const current = result && result.filter === filter ? result : null;

  return (
    <div className="flex flex-col gap-6">
      <FilterChips label="Filtrer forespørgsler efter status" options={INBOX_FILTERS} value={filter} onChange={setFilter} />

      {!current && (
        <p role="status" className="text-base text-ink-muted">
          Indlæser forespørgsler …
        </p>
      )}

      {current && "error" in current && current.notVerified && (
        <Card>
          <h2 className="text-lg font-semibold text-ink">Afventer verifikation</h2>
          <p className="mt-2 text-base leading-relaxed text-ink-muted">
            Din profil er oprettet, men en administrator har ikke verificeret din autorisation endnu. Du modtager
            forespørgsler, når din profil er verificeret.
          </p>
        </Card>
      )}

      {current && "error" in current && !current.notVerified && (
        <Alert tone="danger" role="alert" title="Indbakken kunne ikke hentes">
          {current.error}
        </Alert>
      )}

      {current && "items" in current && current.items.length === 0 && (
        <Card>
          <p className="text-base leading-relaxed text-ink-muted">
            {filter === "alle"
              ? "Der er ingen forespørgsler endnu. Når en patient sender en forespørgsel, der matcher din profil, vises den her."
              : "Der er ingen forespørgsler med denne status."}
          </p>
        </Card>
      )}

      {current && "items" in current && current.items.length > 0 && (
        <ul aria-label="Forespørgsler" className="flex flex-col gap-3">
          {current.items.map((item) => (
            <li key={item.requestId}>
              <InboxCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InboxCard({ item }: { item: InboxItemDto }) {
  const open = isOpenForResponses(item.requestStatus, item.expiresAt);
  const closedText = item.requestStatus === "closed" ? "Lukket" : "Udløbet";
  const imageText =
    item.imageCount === 0 ? "Ingen" : `${item.imageCount} ${item.imageCount === 1 ? "billede" : "billeder"}`;
  const area = item.area.city ? `${item.area.postalCode} ${item.area.city}` : item.area.postalCode;

  return (
    <Link
      href={`/tandlaege/forespoergsel/${item.requestId}`}
      className="flex min-h-12 flex-col gap-4 rounded-2xl border border-line bg-surface p-5 text-ink no-underline shadow-sm transition-colors hover:border-brand-400 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-lg font-semibold text-ink">{categoryLabel(item.category)}</span>
        <div className="flex flex-wrap gap-2">
          <Badge tone={recipientTone[item.recipientStatus]}>{RECIPIENT_STATUS_LABEL[item.recipientStatus]}</Badge>
          {!open && <Badge tone="warning">{closedText}</Badge>}
        </div>
      </div>
      <DefinitionList
        items={[
          { label: "Område", value: area },
          { label: "Afstand", value: formatKm(item.distanceKm) },
          { label: "Billeder", value: imageText },
          { label: "Sendt", value: formatDate(item.sentAt) },
          { label: "Svar senest", value: formatDate(item.expiresAt) },
        ]}
      />
      <span className="text-base font-semibold text-brand-700">Se forespørgslen og svar</span>
    </Link>
  );
}
