import { LinkButton } from "@/views/components/ui/button";
import { sendHref } from "@/views/utils/case-links";
import type { CompareChoice } from "@/views/utils/compare-selection";

// Bund-bar, når patienten kommer fra en sag (?sag=): viser de valgte klinikker og fører videre til afsendelsen.
// Chips står på én linje med vandret scroll, så baren er lav på mobil og ikke dækker kortindholdet.
export function CompareBar({
  caseId,
  choices,
  max,
  onRemove,
}: {
  caseId: string;
  choices: CompareChoice[];
  // Antal klinikker, der højst kan vælges nu (architecture 6.1, 10.5).
  max: number;
  onRemove: (id: string) => void;
}) {
  if (choices.length === 0) return null;
  const href = sendHref(caseId, choices.map((c) => c.id));
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface shadow-raised" role="region" aria-label="Valgte klinikker">
      <div className="mx-auto flex max-w-wide flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-3">
        <div className="min-w-0 sm:flex-1">
          <p className="text-sm font-semibold text-ink" data-testid="valgte-antal">
            {choices.length} af {max} mulige klinikker valgt
          </p>
          <ul className="flex flex-nowrap gap-2 overflow-x-auto py-1" data-testid="valgte-chips">
            {choices.map((choice) => (
              <li key={choice.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => onRemove(choice.id)}
                  className="inline-flex min-h-11 max-w-[14rem] items-center gap-2 rounded-pill bg-brand-50 px-3 text-sm font-semibold text-brand-800 ring-1 ring-inset ring-brand-200"
                >
                  <span className="truncate">{choice.name}</span>
                  <span aria-hidden="true">×</span>
                  <span className="sr-only">Fjern</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <LinkButton href={href} className="shrink-0">
          Kontakt {choices.length === 1 ? "klinikken" : "klinikkerne"}
        </LinkButton>
      </div>
    </div>
  );
}
