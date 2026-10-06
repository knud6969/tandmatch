import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DefinitionList } from "@/components/ui/definition-list";
import { serviceLabel } from "@/lib/constants/standard-labels";
import { formatDateTime, formatKm, formatOneDecimal, formatPriceRange } from "@/lib/format/danish";
import type { StandardService } from "@/lib/types/common";
import type { DentistListItemDto } from "@/lib/types/standard";
import { TrustpilotBlock } from "@/components/standard/trustpilot-block";

// Ét resultat på standard-listen. Viser kun det, API'et giver: ingen patientdata, og andre tandlægers svar vises ikke.
export function DentistCard({ item, service }: { item: DentistListItemDto; service: StandardService }) {
  const name = item.title ? `${item.title} ${item.fullName}` : item.fullName;
  const price = item.prices.find((p) => p.service === service);
  const { reviewStats } = item;

  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-ink">{name}</h2>
        <p className="text-base text-ink-muted">
          {item.clinic.name}, {item.clinic.city}
        </p>
      </div>

      <DefinitionList
        items={[
          { label: "Afstand", value: item.distanceKm !== null ? formatKm(item.distanceKm) : "Angiv dit postnummer for afstand" },
          {
            label: "Næste ledige tid",
            value: item.nextAvailableAt ? formatDateTime(item.nextAvailableAt) : "Ikke oplyst for nylig. Kontakt klinikken.",
          },
          {
            label: `Pris for ${serviceLabel(service).toLowerCase()}`,
            value: price
              ? `${formatPriceRange(price.price.min, price.price.max)}${price.note ? ` (${price.note})` : ""}`
              : "Ikke oplyst",
          },
          {
            label: "TandMatch-anmeldelser",
            value:
              reviewStats.reviewCount > 0 && reviewStats.avgStars !== null
                ? `${formatOneDecimal(reviewStats.avgStars)} af 5 · ${reviewStats.reviewCount} verificerede`
                : "Ingen verificerede anmeldelser endnu",
          },
        ]}
      />

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <h3 className="text-sm font-semibold text-ink-muted">Trustpilot</h3>
        <TrustpilotBlock trustpilot={item.trustpilot} />
      </div>

      <LinkButton href={`/tandlaeger/${item.id}`} variant="secondary" className="w-full sm:w-auto sm:self-start">
        Se profil for {name}
      </LinkButton>
    </Card>
  );
}
