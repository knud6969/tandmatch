import type { ClinicListItemDto } from "@/lib/types/clinics";
import { formatKm, formatPercent, formatPriceRange, formatShortDateTime } from "@/views/utils/format";
import { StarRating } from "@/views/components/clinic-directory/star-rating";
import { TrustpilotLine } from "@/views/components/clinic-directory/trustpilot-block";

export const PRICE_SOURCE = "ifølge klinikkens prisliste";

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
                <span className="block">{formatPercent(stats.priceAccuracyPct)} svarede prisen til prisoverslaget</span>
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
            <>
              <span className="text-base font-semibold">{formatPriceRange(clinic.priceForSelection.min, clinic.priceForSelection.max)}</span>{" "}
              <span className="text-ink-muted">for dit valg, {PRICE_SOURCE}</span>
            </>
          ) : hasServices ? (
            <span className="text-ink-muted">Prisen for dit valg er ikke angivet i klinikkens prisliste</span>
          ) : (
            <span className="text-ink-muted">Vælg en behandling for at se prisen, {PRICE_SOURCE}</span>
          )}
        </p>
      )}

      {full && (
        <p className="text-sm text-ink">
          <span className="text-ink-muted">{emergency ? "Første akuttid: " : "Første ledige tid: "}</span>
          {nextAt ? (
            <span className="font-semibold">{formatShortDateTime(nextAt)}</span>
          ) : (
            <span className="text-ink-muted">{emergency ? "ingen akuttid de næste 14 dage" : "ingen ledige tider de næste 14 dage"}</span>
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
export function ClinicWhere({ clinic }: { clinic: ClinicListItemDto }) {
  return (
    <p className="text-sm text-ink-muted">
      {clinic.address}, {clinic.postalCode} {clinic.city}
      {clinic.distanceKm !== null && <span className="font-semibold text-ink"> · {formatKm(clinic.distanceKm)}</span>}
    </p>
  );
}
