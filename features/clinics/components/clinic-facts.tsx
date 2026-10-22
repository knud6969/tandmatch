import { FIRST_AVAILABLE_SEARCH_DAYS } from "@/lib/booking/constants/bookings";
import type { ClinicListItemDto } from "@/lib/clinics/types/clinics";
import { PRICE_SOURCE, PriceWithSource } from "@/components/ui/price-with-source";
import { formatKm, formatPercent, formatShortDateTime } from "@/platform/ui-utils/format";
import { StarRating } from "@/features/clinics/components/star-rating";
import { TrustpilotLine } from "@/features/clinics/components/trustpilot-block";

type FactsProps = {
  clinic: ClinicListItemDto;
  // Patienten har valgt behandlinger, så prisen for valget kan vises.
  hasServices: boolean;
  // Akutfilteret er slået til: vis første akuttid i stedet for første ledige tid.
  emergency: boolean;
};

// De nøgleoplysninger, der vises ens i klinikkort og kortets popup: bedømmelse, pris med kilde, første tid og Trustpilot.
export function ClinicFacts({ clinic, hasServices, emergency }: FactsProps) {
  const full = clinic.tier === "full";
  const stats = clinic.reviewStats;
  const nextAt = emergency ? clinic.firstEmergencyAt : clinic.firstAvailableAt;

  return (
    <div className="flex flex-col gap-1.5">
      {full && (
        <p className="text-sm text-ink-muted">
          {stats && stats.reviewCount > 0 && stats.avgStars !== null ? (
            <>
              <StarRating value={stats.avgStars} count={stats.reviewCount} />
              <span className="sr-only"> verificerede anmeldelser</span>
              <span aria-hidden="true"> verificerede</span>
              {stats.priceAccuracyPct !== null && (
                <span className="block">Prisnøjagtighed {formatPercent(stats.priceAccuracyPct)}</span>
              )}
            </>
          ) : (
            "Ingen verificerede anmeldelser endnu"
          )}
        </p>
      )}

      {full && (
        <p className="text-sm text-ink">
          {clinic.priceForSelection ? (
            <PriceWithSource price={clinic.priceForSelection} prefix="for dit valg," priceClassName="text-base font-semibold" />
          ) : hasServices ? (
            <span className="text-ink-muted">Prisen for dit valg er ikke angivet i klinikkens prisliste</span>
          ) : (
            <span className="text-ink-muted">Vælg en behandling for at se prisen, {PRICE_SOURCE}</span>
          )}
        </p>
      )}

      {full && (
        <p className="text-sm text-ink">
          <span className="text-ink-muted">{emergency ? "Første akuttid: " : hasServices ? "Første ledige tid: " : "Første ledige tid (undersøgelse): "}</span>
          {nextAt ? (
            <span className="font-semibold">{formatShortDateTime(nextAt)}</span>
          ) : (
            <span className="text-ink-muted">{emergency ? `ingen akuttid de næste ${FIRST_AVAILABLE_SEARCH_DAYS} dage` : `ingen ledige tider de næste ${FIRST_AVAILABLE_SEARCH_DAYS} dage`}</span>
          )}
        </p>
      )}

      {!full && (
        <p className="text-sm text-ink-muted">
          Klinikken er endnu ikke på TandMatch. Vi viser kun grunddata, så der er ingen priser eller anmeldelser her.
        </p>
      )}

      <TrustpilotLine trustpilot={clinic.trustpilot} />
    </div>
  );
}

// Adresse og evt. afstand på én linje.
export function ClinicWhere({ clinic, size = "sm" }: { clinic: Pick<ClinicListItemDto, "address" | "postalCode" | "city" | "distanceKm">; size?: "sm" | "base" }) {
  return (
    <p className={size === "base" ? "text-base text-ink-muted" : "text-sm text-ink-muted"}>
      {clinic.address}, {clinic.postalCode} {clinic.city}
      {clinic.distanceKm !== null && <span className="font-semibold text-ink"> · {formatKm(clinic.distanceKm)}</span>}
    </p>
  );
}
