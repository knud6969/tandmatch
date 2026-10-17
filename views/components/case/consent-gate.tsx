"use client";

import { useState } from "react";
import { CONSENT_TEXT_VERSIONS, CONSENT_TEXTS, CONSENT_TYPE_LABEL } from "@/lib/constants/consents";
import type { ConsentDto } from "@/lib/types/consents";
import type { ConsentType } from "@/lib/types/common";
import { Alert } from "@/views/components/ui/alert";
import { Button } from "@/views/components/ui/button";
import { CheckboxField } from "@/views/components/ui/checkbox-field";
import { StatusMessage } from "@/views/components/ui/status-message";
import { apiRequest } from "@/views/utils/api-client";
import { useAction } from "@/views/utils/use-action";

type GateType = Extract<ConsentType, "ai_processing" | "image_upload" | "health_data_sharing">;

// Har patienten et aktivt samtykke i den aktuelle tekstversion?
export function hasActiveConsent(consents: ConsentDto[], type: ConsentType): boolean {
  return consents.some((c) => c.type === type && c.withdrawnAt === null && c.textVersion === CONSENT_TEXT_VERSIONS[type]);
}

// Særskilt samtykke lige før handlingen (architecture 9.4). Aldrig forudafkrydset og aldrig samlet med andre samtykker.
export function ConsentGate({ type, onGranted, actionLabel = "Giv samtykke og fortsæt" }: { type: GateType; onGranted: () => void; actionLabel?: string }) {
  const [checked, setChecked] = useState(false);
  const action = useAction();

  async function grant() {
    await action.run(async () => {
      await apiRequest("/api/consents", { method: "POST", body: { type, textVersion: CONSENT_TEXT_VERSIONS[type] } });
      onGranted();
    });
  }

  return (
    <div className="flex flex-col gap-4" data-testid={`samtykke-${type}`}>
      <Alert tone="info" title={CONSENT_TYPE_LABEL[type]}>
        <p>{CONSENT_TEXTS[type]}</p>
      </Alert>
      <CheckboxField
        label="Jeg giver mit samtykke"
        selected={checked}
        checked={checked}
        onChange={(event) => setChecked(event.target.checked)}
      />
      <StatusMessage message={action.message} />
      <Button onClick={grant} disabled={!checked || action.busy}>
        {action.busy ? "Gemmer …" : actionLabel}
      </Button>
    </div>
  );
}
