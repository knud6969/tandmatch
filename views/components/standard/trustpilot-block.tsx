import { Badge } from "@/views/components/ui/badge";
import { formatDate, formatOneDecimal } from "@/views/utils/format";
import type { TrustpilotInfo } from "@/lib/types/dentists";

// Trustpilot er IKKE hentet af TandMatch. Score og antal er angivet af klinikken selv (architecture 8.4).
export function TrustpilotBlock({ trustpilot }: { trustpilot: TrustpilotInfo | null }) {
  if (!trustpilot?.url) {
    return <p className="text-base text-ink-muted">Klinikken har ikke angivet en Trustpilot-side.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>Angivet af klinikken</Badge>
      </div>
      <p className="text-base text-ink">
        {trustpilot.score !== null ? (
          <>
            <span className="text-xl font-semibold">{formatOneDecimal(trustpilot.score)}</span> af 5
          </>
        ) : (
          "Ingen score angivet"
        )}
        {trustpilot.reviewCount !== null && ` · ${trustpilot.reviewCount} anmeldelser`}
      </p>
      {trustpilot.updatedAt && (
        <p className="text-sm text-ink-muted">Angivet af klinikken d. {formatDate(trustpilot.updatedAt)}</p>
      )}
      <a
        href={trustpilot.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center text-base font-semibold text-brand-700 underline-offset-2 hover:underline"
      >
        Se klinikkens side på Trustpilot <span className="sr-only">(åbnes i ny fane)</span>
      </a>
    </div>
  );
}
