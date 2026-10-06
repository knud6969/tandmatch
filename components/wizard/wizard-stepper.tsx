"use client";

import { WIZARD_STEPS, type WizardStep } from "@/components/wizard/wizard-shared";
import { cx } from "@/components/ui/cx";

// Trinliste. Vandret og scrollbar på mobil, lodret i venstre kolonne på skrivebord.
export function WizardStepper({ current, onSelect }: { current: WizardStep; onSelect: (step: WizardStep) => void }) {
  return (
    <nav aria-label="Trin i forespørgslen">
      <ol className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
        {WIZARD_STEPS.map((step, index) => {
          const active = step.key === current;
          return (
            <li key={step.key} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelect(step.key)}
                aria-current={active ? "step" : undefined}
                className={cx(
                  "flex min-h-11 w-full items-center gap-2.5 rounded-full px-4 text-sm font-semibold whitespace-nowrap ring-1 ring-inset transition-colors lg:rounded-lg lg:py-2.5",
                  active
                    ? "bg-brand-600 text-white ring-brand-600"
                    : "bg-surface text-ink ring-line hover:ring-brand-400",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs",
                    active ? "bg-white text-brand-700" : "bg-canvas text-ink-muted",
                  )}
                >
                  {index + 1}
                </span>
                {step.label}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
