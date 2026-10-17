import { LinkButton } from "@/views/components/ui/button";
import { sendHref } from "@/views/utils/case-links";
import type { CompareChoice } from "@/views/utils/compare-selection";

export type { CompareChoice };

// Bund-bar, når patienten kommer fra en sag (?sag=): viser de valgte klinikker (op til 3) og fører videre til afsendelsen.
export function CompareBar({
  caseId,
  choices,
  max,
  onRemove,
}: {
  caseId: string;
  choices: CompareChoice[];
  // Højst tre minus sagens aktive leads (architecture 6.1, 10.5).
  max: number;
  onRemove: (id: string) => void;
}) {
  if (choices.length === 0) return null;
  const href = sendHref(caseId, choices.map((c) => c.id));
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface shadow-raised" role="region" aria-label="Valgte klinikker">
      <div className="mx-auto flex max-w-wide flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink" data-testid="valgte-antal">
            {choices.length} af {max} mulige klinikker valgt
          </p>
          <ul className="flex flex-wrap gap-2">
            {choices.map((choice) => (
              <li key={choice.id}>
                <button
                  type="button"
                  onClick={() => onRemove(choice.id)}
                  className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-pill bg-brand-50 px-3 text-sm font-semibold text-brand-800 ring-1 ring-inset ring-brand-200"
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
