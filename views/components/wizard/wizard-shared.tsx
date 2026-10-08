import type { ReactNode, Ref } from "react";
import { Button } from "@/views/components/ui/button";
import type { ConsentType } from "@/lib/types/common";
import type { ConsentDto } from "@/lib/types/consents";
import type { RequestDraftDto } from "@/lib/types/requests";

export const WIZARD_STEPS = [
  { key: "kategori", label: "Kategori" },
  { key: "spoergsmaal", label: "Spørgsmål" },
  { key: "chat", label: "Chat" },
  { key: "billeder", label: "Billeder" },
  { key: "opsummering", label: "Opsummering" },
  { key: "send", label: "Send" },
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number]["key"];

// Props som alle trin får fra wizarden.
export type StepProps = {
  draft: RequestDraftDto;
  onDraftChange: (next: RequestDraftDto) => void;
  reloadDraft: () => Promise<void>;
  consents: ConsentDto[];
  reloadConsents: () => Promise<void>;
  isAnonymous: boolean;
  goTo: (step: WizardStep) => void;
};

// Seneste række for typen bestemmer, om samtykket er aktivt (architecture 4.3).
export function hasActiveConsent(consents: ConsentDto[], type: ConsentType): boolean {
  const latest = consents.find((consent) => consent.type === type);
  return latest !== undefined && latest.withdrawnAt === null;
}

// Tilbage/næste nederst i hvert trin. Store trykflader på mobil (architecture 6.2, CLAUDE.md).
export function StepNav({
  onBack,
  onNext,
  nextLabel = "Næste",
  nextDisabled = false,
  pending = false,
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  pending?: boolean;
}) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:justify-between">
      {onBack ? (
        <Button variant="secondary" onClick={onBack} disabled={pending} className="w-full sm:w-auto">
          Tilbage
        </Button>
      ) : (
        <span />
      )}
      {onNext && (
        <Button onClick={onNext} disabled={nextDisabled || pending} className="w-full sm:w-auto">
          {pending ? "Gemmer …" : nextLabel}
        </Button>
      )}
    </div>
  );
}

// Fælles layout for et trin: overskrift (fokuseres ved skift) og indhold.
export function StepFrame({
  index,
  title,
  headingRef,
  children,
}: {
  index: number;
  title: string;
  headingRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold tracking-tight text-ink outline-none">
        <span className="block text-sm font-semibold text-brand-700">
          Trin {index} af {WIZARD_STEPS.length}
        </span>
        {title}
      </h2>
      {children}
    </div>
  );
}
