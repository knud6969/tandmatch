import { formatOneDecimal } from "@/views/utils/format";

// Stjerner med tekst til skærmlæsere. De visuelle stjerner er skjult for hjælpemidler. `value` kan have decimaler.
export function StarRating({ value, count, size = "md" }: { value: number; count?: number; size?: "md" | "lg" }) {
  const rounded = Math.round(Math.min(5, Math.max(0, value)));
  const text = `${formatOneDecimal(value)} af 5 stjerner${count !== undefined ? ` ud fra ${count} anmeldelser` : ""}`;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span role="img" aria-label={text} className={size === "lg" ? "text-xl tracking-wide" : "text-base tracking-wide"}>
        <span aria-hidden="true" className="text-brand-700">
          {"★".repeat(rounded)}
          <span className="text-ink-muted/50">{"★".repeat(5 - rounded)}</span>
        </span>
      </span>
      <span aria-hidden="true" className="text-sm font-semibold text-ink">
        {formatOneDecimal(value)}
        {count !== undefined && <span className="font-normal text-ink-muted"> ({count})</span>}
      </span>
    </span>
  );
}

// Hele stjerner for en enkelt anmeldelse (1-5).
export function Stars({ stars }: { stars: number }) {
  return (
    <span role="img" aria-label={`${stars} af 5 stjerner`} className="text-lg tracking-wide">
      <span aria-hidden="true" className="text-brand-700">
        {"★".repeat(stars)}
        <span className="text-ink-muted/50">{"★".repeat(5 - stars)}</span>
      </span>
    </span>
  );
}
