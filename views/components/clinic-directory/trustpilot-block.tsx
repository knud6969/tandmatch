import type { TrustpilotInfo } from "@/lib/types/common";
import { formatDate, formatOneDecimal } from "@/views/utils/format";
import { ExternalLink } from "@/views/components/clinic-directory/external-link";

// Mærkat efter hvem der har indtastet tallene (architecture 8.4). Trustpilot hentes eller scrapes aldrig af TandMatch.
export function trustpilotSource(trustpilot: NonNullable<TrustpilotInfo>): string {
  return trustpilot.enteredBy === "clinic" ? "angivet af klinikken" : "angivet af TandMatch";
}

// Kort visning i klinikkort og kortets popup. Linket ligger over kortets klikflade (relative z-10).
export function TrustpilotLine({ trustpilot }: { trustpilot: TrustpilotInfo }) {
  if (!trustpilot) return null;
  return (
    <p className="text-sm text-ink-muted">
      <span className="font-semibold text-ink">Trustpilot</span>
      {trustpilot.score !== null && <> {formatOneDecimal(trustpilot.score)}</>} ({trustpilotSource(trustpilot)}){" "}
      <ExternalLink href={trustpilot.url} className="relative z-10 min-h-0 text-sm">
        Se på Trustpilot
      </ExternalLink>
    </p>
  );
}

// Fuld visning på profilen, adskilt fra platformens egne anmeldelser.
export function TrustpilotBlock({ trustpilot }: { trustpilot: TrustpilotInfo }) {
  if (!trustpilot) {
    return <p className="text-base text-ink-muted">Klinikken har ikke en Trustpilot-side, som vi kender til.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-base text-ink">
        {trustpilot.score !== null ? (
          <>
            <span className="text-2xl font-semibold">{formatOneDecimal(trustpilot.score)}</span> af 5
            {trustpilot.reviewCount !== null && <span className="text-ink-muted"> · {trustpilot.reviewCount} anmeldelser</span>}
          </>
        ) : (
          "Score er ikke angivet."
        )}
      </p>
      <p className="text-sm text-ink-muted">
        Kilde: Trustpilot, {trustpilotSource(trustpilot)}
        {trustpilot.updatedAt && <>, opdateret d. {formatDate(trustpilot.updatedAt)}</>}. TandMatch henter ikke selv tallene fra
        Trustpilot og kan ikke stå inde for dem.
      </p>
      <ExternalLink href={trustpilot.url}>Se klinikkens side på Trustpilot</ExternalLink>
    </div>
  );
}
