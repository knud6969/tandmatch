"use client";

import { useId, useState } from "react";
import { Alert } from "@/views/components/ui/alert";
import { Button } from "@/views/components/ui/button";
import { ApiRequestError, apiRequest } from "@/views/utils/api-client";
import { apiErrorMessage, STALE_STATE_CODES } from "@/views/utils/api-errors";

type WithdrawResponseProps = {
  responseId: string;
  onWithdrawn: () => void;
  onStale: () => void;
};

// Tilbagetræk af eget svar. Vises kun, når API'et tillader det (ikke valgt af patienten, ikke trukket tilbage, forespørgslen er åben).
// To trin: først en bekræftelse, så et ved en fejltast ikke trækker svaret tilbage.
export function WithdrawResponse({ responseId, onWithdrawn, onStale }: WithdrawResponseProps) {
  const headingId = useId();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    setPending(true);
    setError(null);
    try {
      await apiRequest(`/api/responses/${responseId}`, { method: "PATCH", body: { status: "withdrawn" } });
      setPending(false);
      onWithdrawn();
    } catch (err) {
      setPending(false);
      setError(apiErrorMessage(err));
      if (err instanceof ApiRequestError && (STALE_STATE_CODES as readonly string[]).includes(err.code)) {
        onStale();
      }
    }
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4 border-t border-line pt-6">
      <h3 id={headingId} className="text-lg font-semibold text-ink">
        Træk svar tilbage
      </h3>
      <p className="text-base leading-relaxed text-ink-muted">
        Et tilbagetrukket svar kan ikke ændres igen. Du kan kun trække svaret tilbage, så længe patienten ikke har
        valgt, og forespørgslen er åben.
      </p>
      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}
      {!confirming ? (
        <Button variant="secondary" onClick={() => setConfirming(true)} className="w-full sm:w-auto sm:self-start">
          Træk svar tilbage
        </Button>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button onClick={withdraw} disabled={pending} className="w-full sm:w-auto">
            {pending ? "Trækker tilbage …" : "Ja, træk svaret tilbage"}
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending} className="w-full sm:w-auto">
            Behold svaret
          </Button>
        </div>
      )}
    </section>
  );
}
