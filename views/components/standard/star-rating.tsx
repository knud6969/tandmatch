// Stjerner med tekst til skærmlæsere. De visuelle stjerner er skjult for hjælpemidler.
export function StarRating({ stars }: { stars: number }) {
  const filled = "★".repeat(stars);
  const empty = "☆".repeat(5 - stars);
  return (
    <span role="img" aria-label={`${stars} af 5 stjerner`} className="text-lg tracking-wide text-brand-700">
      <span aria-hidden="true">
        {filled}
        <span className="text-ink-muted/60">{empty}</span>
      </span>
    </span>
  );
}
