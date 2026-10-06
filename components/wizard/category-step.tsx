"use client";

import { useState, type Ref } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { apiRequest } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/error-messages";
import { CATEGORY_OPTIONS } from "@/lib/constants/category-labels";
import type { CosmeticCategory } from "@/lib/types/common";
import type { RequestDraftDto } from "@/lib/types/requests";
import { StepFrame, StepNav, type StepProps } from "@/components/wizard/wizard-shared";

// Trin 1: kategori. Valgt af patienten, aldrig af AI (architecture 4.3, 7.1).
export function CategoryStep({ draft, onDraftChange, goTo, headingRef }: StepProps & { headingRef: Ref<HTMLHeadingElement> }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(value: CosmeticCategory) {
    if (value === draft.category) return;
    setPending(true);
    setError(null);
    try {
      const next = await apiRequest<RequestDraftDto>(`/api/requests/${draft.id}`, {
        method: "PATCH",
        body: { category: value },
      });
      onDraftChange(next);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <StepFrame index={1} title="Hvad drejer din henvendelse sig om?" headingRef={headingRef}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warning">Pladsholder</Badge>
        <span className="text-sm text-ink-muted">Kategorierne er midlertidige, til den endelige liste er besluttet.</span>
      </div>
      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}
      <ChoiceGroup
        legend="Vælg den kategori, der passer bedst"
        options={CATEGORY_OPTIONS}
        value={draft.category}
        onChange={(value) => void choose(value)}
      />
      <StepNav onNext={() => goTo("spoergsmaal")} nextDisabled={pending} />
    </StepFrame>
  );
}
