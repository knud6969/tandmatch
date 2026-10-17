"use client";

import { useState } from "react";
import { CASE_TIMEFRAME_LABEL, CASE_TIMEFRAMES } from "@/lib/constants/cases";
import type { CaseDto, CaseTimeframe } from "@/lib/types/cases";
import { Button } from "@/views/components/ui/button";
import { ChoiceGroup } from "@/views/components/ui/choice-group";
import { StatusMessage } from "@/views/components/ui/status-message";
import { TextField } from "@/views/components/ui/text-field";
import { apiRequest } from "@/views/utils/api-client";
import { isPostalCode } from "@/views/utils/clinic-query";
import { useAction } from "@/views/utils/use-action";

type Props = {
  caseDto: CaseDto;
  onSaved: () => void;
  onBack: () => void;
  onContinue: () => void;
};

// Ønsket tidsrum og postnummer. Postnummeret bruges til afstanden i klinikoversigten.
export function TimeframeStep({ caseDto, onSaved, onBack, onContinue }: Props) {
  const [timeframe, setTimeframe] = useState<CaseTimeframe | null>(caseDto.preferredTimeframe);
  const [postalCode, setPostalCode] = useState(caseDto.postalCode ?? "");
  const [error, setError] = useState<string | undefined>();
  const action = useAction();

  async function save() {
    if (postalCode !== "" && !isPostalCode(postalCode)) {
      setError("Skriv et postnummer med fire cifre.");
      return;
    }
    setError(undefined);
    const ok = await action.run(async () => {
      await apiRequest(`/api/cases/${caseDto.id}`, {
        method: "PATCH",
        body: {
          ...(timeframe ? { preferredTimeframe: timeframe } : {}),
          ...(postalCode ? { postalCode } : {}),
        },
      });
      onSaved();
    });
    if (ok) onContinue();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-ink">Hvornår og hvor?</h2>
        <p className="text-base leading-relaxed text-ink-muted">
          Det hjælper dig med at finde klinikker, der passer. Du kan altid ændre det senere.
        </p>
      </div>
      <ChoiceGroup
        legend="Ønsket tidsrum"
        options={CASE_TIMEFRAMES.map((value) => ({
          value,
          label: CASE_TIMEFRAME_LABEL[value],
        }))}
        value={timeframe}
        onChange={setTimeframe}
      />
      <TextField
        label="Dit postnummer"
        hint="Bruges til at vise afstand til klinikkerne. Det deles ikke, før du sender."
        inputMode="numeric"
        autoComplete="postal-code"
        maxLength={4}
        value={postalCode}
        error={error}
        onChange={(event) => setPostalCode(event.target.value.replace(/\D/g, ""))}
      />
      <StatusMessage message={action.message} />
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Button variant="ghost" onClick={onBack}>
          Tilbage
        </Button>
        <Button onClick={save} disabled={action.busy}>
          {action.busy ? "Gemmer …" : "Gem og fortsæt"}
        </Button>
      </div>
    </div>
  );
}
