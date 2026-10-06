"use client";

import { useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { apiRequest } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/error-messages";
import { CONSENT_TEXT_VERSIONS, CONSENT_TEXTS } from "@/lib/constants/consents";
import type { ConsentType } from "@/lib/types/common";

type ConsentGateProps = {
  type: ConsentType;
  title: string;
  intro: ReactNode;
  buttonLabel: string;
  // Kaldes efter samtykket er gemt, så forælderen kan hente samtykker igen.
  onGranted: () => Promise<void>;
};

// Særskilt, ikke-forudafkrydset samtykke (architecture 4.3, 9.4). Vilkårs-accept erstatter aldrig dette.
export function ConsentGate({ type, title, intro, buttonLabel, onGranted }: ConsentGateProps) {
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function grant() {
    setPending(true);
    setError(null);
    try {
      await apiRequest<unknown>("/api/consents", {
        method: "POST",
        body: { type, textVersion: CONSENT_TEXT_VERSIONS[type] },
      });
      await onGranted();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby={`consent-${type}`}>
      <h3 id={`consent-${type}`} className="text-lg font-semibold text-ink">
        {title}
      </h3>
      <div className="text-base leading-relaxed text-ink-muted">{intro}</div>
      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}
      <CheckboxField
        name={`consent-${type}`}
        checked={checked}
        onChange={(event) => setChecked(event.target.checked)}
        label={CONSENT_TEXTS[type]}
      />
      <Button fullWidth disabled={!checked || pending} onClick={grant} className="sm:w-auto">
        {pending ? "Gemmer samtykke …" : buttonLabel}
      </Button>
    </section>
  );
}
