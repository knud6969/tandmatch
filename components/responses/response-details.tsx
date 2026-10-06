import { DefinitionList, type DefinitionItem } from "@/components/ui/definition-list";
import { formatDate, formatDateTime, formatPriceRange } from "@/lib/format/danish";
import type { ResponseDto } from "@/lib/types/responses";

// Indholdet af et tandlægesvar (pris, tid, tilbud, vurdering). Bruges af både tandlæge og patient.
// Visningen viser kun det svar, den får. Den henter aldrig andre tandlægers svar.
export function ResponseDetails({ response }: { response: ResponseDto }) {
  const items: DefinitionItem[] = [
    { label: "Pris", value: formatPriceRange(response.priceMin, response.priceMax) },
  ];
  if (response.priceNote) items.push({ label: "Prisen dækker", value: response.priceNote });
  if (response.firstAvailableAt) {
    items.push({ label: "Første ledige tid", value: formatDateTime(response.firstAvailableAt) });
  }
  if (response.offer) items.push({ label: "Tilbud", value: response.offer });
  if (response.validUntil) items.push({ label: "Tilbuddet gælder til", value: formatDate(response.validUntil) });

  return (
    <div className="flex flex-col gap-6">
      <DefinitionList items={items} />
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-ink-muted">Tandlægens vurdering</h3>
        <p className="whitespace-pre-line text-base leading-relaxed text-ink">{response.assessment}</p>
      </div>
    </div>
  );
}
