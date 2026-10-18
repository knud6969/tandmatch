"use client";

import Link from "next/link";
import { useState } from "react";
import { CONSENT_TEXT_VERSIONS, CONSENT_TEXTS, CONSENT_TYPES, CONSENT_TYPE_LABEL, CONSENT_WITHDRAW_CONSEQUENCE } from "@/lib/constants/consents";
import type { ConsentType } from "@/lib/types/common";
import type { ConsentDto, WithdrawResultDto } from "@/lib/types/consents";
import { ConsentGate } from "@/views/components/case/consent-gate";
import { Alert } from "@/views/components/ui/alert";
import { Badge } from "@/views/components/ui/badge";
import { Button } from "@/views/components/ui/button";
import { Card } from "@/views/components/ui/card";
import { LoadState } from "@/views/components/ui/load-state";
import { StatusMessage } from "@/views/components/ui/status-message";
import { apiRequest } from "@/views/utils/api-client";
import { loadConsents } from "@/views/utils/consents";
import { formatDateTime } from "@/views/utils/format";
import { useAction } from "@/views/utils/use-action";
import { useLoad } from "@/views/utils/use-load";

type Status = "current" | "old" | "none";

// Seneste aktive samtykke af typen (hvis nogen) og hvor det står i forhold til den gældende tekstversion.
function statusOf(consents: ConsentDto[], type: ConsentType): { status: Status; consent: ConsentDto | null; withdrawn: ConsentDto | null } {
  const ofType = consents.filter((c) => c.type === type).sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
  const active = ofType.filter((c) => c.withdrawnAt === null);
  const current = active.find((c) => c.textVersion === CONSENT_TEXT_VERSIONS[type]);
  if (current) return { status: "current", consent: current, withdrawn: null };
  if (active[0]) return { status: "old", consent: active[0], withdrawn: null };
  return { status: "none", consent: null, withdrawn: ofType[0] ?? null };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// Resultatet af en tilbagetrækning, vist efter at listen er hentet igen (architecture 10.3).
function WithdrawResult({ type, result }: { type: ConsentType; result: WithdrawResultDto }) {
  return (
    <Alert tone="success" role="status" title={`Samtykket til "${CONSENT_TYPE_LABEL[type]}" er trukket tilbage`}>
      <ul className="list-disc space-y-1 pl-5">
        {type === "health_data_sharing" && (
          <li>
            {result.withdrawnLeads === 0
              ? "Ingen åbne henvendelser skulle trækkes tilbage."
              : `${plural(result.withdrawnLeads, "henvendelse er", "henvendelser er")} trukket tilbage.`}
          </li>
        )}
        {result.deletedImages > 0 && <li>{plural(result.deletedImages, "billede er", "billeder er")} slettet.</li>}
        {type === "health_data_sharing" && (
          <li>
            Bookede tider består. Du kan aflyse dem under{" "}
            <Link href="/patient/bookinger" className="font-semibold text-brand-700">
              Bookinger
            </Link>
            .
          </li>
        )}
      </ul>
    </Alert>
  );
}

function ConsentRow({ type, consents, onChanged }: { type: ConsentType; consents: ConsentDto[]; onChanged: (result?: WithdrawResultDto) => void }) {
  const { status, consent, withdrawn } = statusOf(consents, type);
  const [confirming, setConfirming] = useState(false);
  const [granting, setGranting] = useState(false);
  const action = useAction();
  const headingId = `samtykke-${type}-titel`;

  async function withdraw() {
    if (!consent) return;
    let result: WithdrawResultDto | undefined;
    const ok = await action.run(async () => {
      result = await apiRequest<WithdrawResultDto>(`/api/consents/${consent.id}/withdraw`, { method: "POST" });
    });
    setConfirming(false);
    if (ok) onChanged(result);
  }

  const badge =
    status === "current" ? <Badge tone="brand">Givet</Badge> : status === "old" ? <Badge tone="warning">Ældre tekst</Badge> : <Badge>Ikke givet</Badge>;

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-6" data-testid={`samtykkerække-${type}`} aria-labelledby={headingId}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id={headingId} className="text-lg font-semibold text-ink">
          {CONSENT_TYPE_LABEL[type]}
        </h2>
        {badge}
      </div>

      {status === "current" && consent && (
        <>
          <p className="text-base text-ink">{CONSENT_TEXTS[type]}</p>
          <p className="text-sm text-ink-muted">Givet {formatDateTime(consent.grantedAt)}</p>
        </>
      )}
      {status === "old" && consent && (
        <>
          <p className="text-base text-ink">Du har givet samtykke til en ældre tekst ({formatDateTime(consent.grantedAt)}). Teksten er siden ændret. Læs den nye tekst, og giv samtykket igen.</p>
        </>
      )}
      {status === "none" && (
        <p className="text-base text-ink-muted">
          {withdrawn?.withdrawnAt ? `Trukket tilbage ${formatDateTime(withdrawn.withdrawnAt)}.` : "Du har ikke givet dette samtykke."}
        </p>
      )}

      <StatusMessage message={action.message} />

      {granting ? (
        <div className="flex flex-col gap-3">
          <ConsentGate
            type={type}
            actionLabel="Giv samtykke"
            onGranted={() => {
              setGranting(false);
              onChanged();
            }}
          />
          <Button variant="ghost" className="w-full sm:w-fit" onClick={() => setGranting(false)}>
            Annuller
          </Button>
        </div>
      ) : confirming ? (
        <div className="flex flex-col gap-3">
          <Alert tone="danger" title="Det sker, når du trækker samtykket tilbage">
            <p id={`samtykke-${type}-konsekvens`}>{CONSENT_WITHDRAW_CONSEQUENCE[type]}</p>
          </Alert>
          <div className="flex flex-col gap-2 sm:flex-row" role="group" aria-label="Bekræft tilbagetrækning" aria-describedby={`samtykke-${type}-konsekvens`}>
            <Button variant="danger" onClick={withdraw} disabled={action.busy}>
              {action.busy ? "Trækker tilbage …" : "Ja, træk samtykket tilbage"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={action.busy}>
              Behold samtykket
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          {status !== "current" && (
            <Button onClick={() => setGranting(true)} className="w-full sm:w-fit">
              {status === "old" ? "Giv samtykke igen" : "Giv samtykke"}
            </Button>
          )}
          {consent && (
            <Button variant="danger-outline" onClick={() => setConfirming(true)} className="w-full sm:w-fit">
              Træk tilbage …
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

// Patientens samtykker (architecture 6.2, 10.3): én række pr. type med status, tilbagetrækning med konsekvens og "giv igen".
export function ConsentsList() {
  const { data, loading, error, reload } = useLoad(loadConsents);
  const [results, setResults] = useState<Partial<Record<ConsentType, { type: ConsentType; result: WithdrawResultDto }>>>({});
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;

  return (
    <div className="flex flex-col gap-4">
      {CONSENT_TYPES.map((type) => (
        <div key={type} className="flex flex-col gap-3">
          {results[type] && <WithdrawResult type={type} result={results[type].result} />}
          <ConsentRow
            type={type}
            consents={data}
            onChanged={(result) => {
              setResults((current) => ({ ...current, [type]: result ? { type, result } : undefined }));
              reload();
            }}
          />
        </div>
      ))}
    </div>
  );
}
