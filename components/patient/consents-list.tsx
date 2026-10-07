"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiRequest } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/error-messages";
import { CONSENT_TYPE_LABEL, CONSENT_WITHDRAW_CONSEQUENCE } from "@/lib/constants/consent-labels";
import { formatDateTime } from "@/lib/format/danish";
import type { ConsentDto } from "@/lib/types/requests";

type WithdrawResultDto = { withdrawnAt: string; deletedImages: number; sessionDeleted: boolean };

type State =
  | { status: "loading" }
  | { status: "ready"; consents: ConsentDto[] }
  | { status: "error"; message: string };

// Samtykker givet efter GDPR art. 9 (architecture 4.3, 10.3). Vilkårs-accept vises ikke her, det er noget andet.
export function ConsentsList() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<{ consents: ConsentDto[] }>("/api/consents")
      .then((data) => {
        if (active) setState({ status: "ready", consents: data.consents });
      })
      .catch((err: unknown) => {
        if (active) setState({ status: "error", message: apiErrorMessage(err) });
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  function onWithdrawn(result: WithdrawResultDto) {
    const extra = result.deletedImages > 0 ? ` ${result.deletedImages} billede(r) er slettet.` : "";
    setFlash(`Samtykket er trukket tilbage ${formatDateTime(result.withdrawnAt)}.${extra}`);
    setReloadKey((key) => key + 1);
  }

  if (state.status === "loading") {
    return (
      <p role="status" className="text-base text-ink-muted">
        Indlæser dine samtykker …
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <Alert tone="danger" role="alert" title="Samtykkerne kunne ikke hentes">
        {state.message}
      </Alert>
    );
  }

  const sorted = [...state.consents].sort((a, b) => Date.parse(b.grantedAt) - Date.parse(a.grantedAt));
  const active = sorted.filter((c) => c.withdrawnAt === null);
  const withdrawn = sorted.filter((c) => c.withdrawnAt !== null);

  return (
    <div className="flex flex-col gap-6">
      {flash && (
        <Alert tone="success" role="status">
          {flash}
        </Alert>
      )}

      {active.length === 0 ? (
        <p className="text-base text-ink-muted">Du har ingen aktive samtykker.</p>
      ) : (
        <ul aria-label="Aktive samtykker" className="flex flex-col gap-4">
          {active.map((consent) => (
            <li key={consent.id}>
              <ConsentCard consent={consent} onWithdrawn={onWithdrawn} />
            </li>
          ))}
        </ul>
      )}

      {withdrawn.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-ink-muted">Tidligere samtykker</h3>
          <ul aria-label="Tilbagetrukne samtykker" className="flex flex-col gap-3">
            {withdrawn.map((consent) => (
              <li key={consent.id} className="rounded-lg border border-line bg-canvas p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-base font-semibold text-ink">{CONSENT_TYPE_LABEL[consent.type]}</p>
                  <Badge tone="warning">Trukket tilbage</Badge>
                </div>
                <p className="text-sm text-ink-muted">
                  Givet {formatDateTime(consent.grantedAt)} · trukket tilbage {formatDateTime(consent.withdrawnAt as string)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ConsentCard({ consent, onWithdrawn }: { consent: ConsentDto; onWithdrawn: (result: WithdrawResultDto) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    setPending(true);
    setError(null);
    try {
      const result = await apiRequest<WithdrawResultDto>(`/api/consents/${consent.id}/withdraw`, { method: "POST" });
      setPending(false);
      setConfirming(false);
      onWithdrawn(result);
    } catch (err) {
      setPending(false);
      setError(apiErrorMessage(err));
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-ink">{CONSENT_TYPE_LABEL[consent.type]}</h3>
        <Badge tone="brand">Aktivt</Badge>
      </div>
      <p className="text-sm text-ink-muted">Givet {formatDateTime(consent.grantedAt)}</p>

      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}

      {!confirming ? (
        <Button variant="secondary" onClick={() => setConfirming(true)} className="w-full sm:w-auto sm:self-start">
          Træk tilbage
        </Button>
      ) : (
        <Alert tone="warning" title="Træk samtykket tilbage?">
          <p>{CONSENT_WITHDRAW_CONSEQUENCE[consent.type]}</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Button onClick={withdraw} disabled={pending} className="w-full sm:w-auto">
              {pending ? "Gemmer …" : "Ja, træk tilbage"}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending} className="w-full sm:w-auto">
              Annuller
            </Button>
          </div>
        </Alert>
      )}
    </Card>
  );
}
