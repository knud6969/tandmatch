"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CONSENT_TEXT_VERSIONS, CONSENT_TEXTS, CONSENT_TYPE_LABEL } from "@/lib/constants/consents";
import { AI_BOUNDARY_TEXT } from "@/lib/constants/ai-texts";
import type { CaseDto, CaseListItemDto } from "@/lib/types/cases";
import type { AnonymousSessionDto } from "@/lib/types/session";
import { useSession } from "@/views/components/session/session-provider";
import { Alert } from "@/views/components/ui/alert";
import { Button, LinkButton } from "@/views/components/ui/button";
import { CheckboxField } from "@/views/components/ui/checkbox-field";
import { LoadState } from "@/views/components/ui/load-state";
import { StatusMessage } from "@/views/components/ui/status-message";
import { apiRequest } from "@/views/utils/api-client";
import { useAction } from "@/views/utils/use-action";
import { useLoad } from "@/views/utils/use-load";

const STEPS = [
  "Du beskriver dit problem med dine egne ord og kan uploade billeder, hvis du vil.",
  "AI-assistenten stiller uddybende spørgsmål og hjælper dig med at sætte ord på det.",
  "Du bekræfter selv behandlingerne og godkender en opsummering.",
  "Du sammenligner klinikker og vælger, hvem der skal have din forespørgsel.",
];

function Intro() {
  return (
    <header className="flex flex-col gap-3">
      <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Beskriv dit problem</h1>
      <p className="text-base leading-relaxed text-ink-muted sm:text-lg">
        Fortæl, hvad du oplever, eller hvad du gerne vil have lavet. Du kan starte uden at oprette en konto.
      </p>
      <ol className="mt-1 flex list-decimal flex-col gap-1.5 pl-5 text-base leading-relaxed text-ink">
        {STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <Alert tone="info" title="AI’en beskriver, klinikken vurderer">
        <p>{AI_BOUNDARY_TEXT} AI-assistenten anbefaler ikke bestemte klinikker og nævner ikke priser.</p>
      </Alert>
    </header>
  );
}

// Anonym: særskilt AI-samtykke og en anonym session med en tom sag (architecture 6.1, 10.2).
function AnonymousStart() {
  const router = useRouter();
  const { refresh } = useSession();
  const [checked, setChecked] = useState(false);
  const action = useAction();

  async function start() {
    const ok = await action.run(async () => {
      const result = await apiRequest<AnonymousSessionDto>("/api/session/anonymous", {
        method: "POST",
        body: { aiConsent: { textVersion: CONSENT_TEXT_VERSIONS.ai_processing } },
      });
      await refresh();
      router.push(`/start/${result.caseId}`);
    });
    if (!ok) setChecked(true);
  }

  return (
    <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-card sm:p-8" aria-labelledby="samtykke-overskrift">
      <h2 id="samtykke-overskrift" className="text-xl font-semibold text-ink">
        {CONSENT_TYPE_LABEL.ai_processing}
      </h2>
      <CheckboxField label={CONSENT_TEXTS.ai_processing} selected={checked} checked={checked} onChange={(e) => setChecked(e.target.checked)} />
      <p className="text-sm text-ink-muted">
        Du giver ikke samtykke til billeder her. Det spørger vi om særskilt, hvis du vil uploade et billede. Læs mere i vores{" "}
        <Link href="/privatliv" className="font-semibold text-brand-700">
          privatlivspolitik
        </Link>
        .
      </p>
      <StatusMessage message={action.message} />
      <Button onClick={start} disabled={!checked || action.busy} fullWidth>
        {action.busy ? "Starter …" : "Start samtalen"}
      </Button>
    </section>
  );
}

// Anonym med eksisterende kladde: samme kald er idempotent og returnerer den eksisterende sag.
function ContinueAnonymous() {
  const router = useRouter();
  const action = useAction();
  async function resume() {
    await action.run(async () => {
      const result = await apiRequest<AnonymousSessionDto>("/api/session/anonymous", {
        method: "POST",
        body: { aiConsent: { textVersion: CONSENT_TEXT_VERSIONS.ai_processing } },
      });
      router.push(`/start/${result.caseId}`);
    });
  }
  return (
    <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-card sm:p-8">
      <h2 className="text-xl font-semibold text-ink">Du har en igangværende samtale</h2>
      <p className="text-base text-ink-muted">Din anonyme samtale gemmes i 48 timer. Du kan fortsætte, hvor du slap.</p>
      <StatusMessage message={action.message} />
      <Button onClick={resume} disabled={action.busy} fullWidth>
        {action.busy ? "Åbner …" : "Fortsæt samtalen"}
      </Button>
    </section>
  );
}

const loadCases = async (): Promise<CaseListItemDto[]> => (await apiRequest<{ cases: CaseListItemDto[] }>("/api/cases")).cases;

// Patient med konto: fortsæt en kladde eller start en ny sag.
function AccountStart() {
  const router = useRouter();
  const cases = useLoad(loadCases);
  const action = useAction();
  const drafts = (cases.data ?? []).filter((c) => c.status === "draft");

  async function create() {
    const ok = await action.run(async () => {
      const created = await apiRequest<CaseDto>("/api/cases", { method: "POST" });
      router.push(`/start/${created.id}`);
    });
    return ok;
  }

  if (cases.loading || cases.error) return <LoadState loading={cases.loading} error={cases.error} onRetry={cases.reload} />;
  return (
    <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-card sm:p-8">
      {drafts.length > 0 && (
        <>
          <h2 className="text-xl font-semibold text-ink">Fortsæt en igangværende sag</h2>
          <ul className="flex flex-col gap-2">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <LinkButton href={`/start/${draft.id}`} variant="secondary" fullWidth>
                  Fortsæt kladde{draft.serviceNames.length > 0 ? `: ${draft.serviceNames.join(", ")}` : ""}
                </LinkButton>
              </li>
            ))}
          </ul>
        </>
      )}
      <h2 className="text-xl font-semibold text-ink">Start en ny sag</h2>
      <p className="text-base text-ink-muted">Du bliver bedt om samtykke til AI-behandling, første gang du skriver til AI-assistenten.</p>
      <StatusMessage message={action.message} />
      <Button onClick={create} disabled={action.busy} fullWidth>
        {action.busy ? "Opretter …" : "Start samtalen"}
      </Button>
    </section>
  );
}

// /start (architecture 6.1): forklaring og indgang til sagsflowet.
export function StartForm() {
  const { state } = useSession();
  const me = state.status === "ready" ? state.me : null;

  let body;
  if (state.status === "loading") body = <LoadState loading error={null} onRetry={() => {}} />;
  else if (me?.role === "clinic" || me?.role === "admin") {
    body = (
      <Alert tone="info" title="Kun for patienter">
        <p>Samtalen er til patienter. Du er logget ind som klinik.</p>
      </Alert>
    );
  } else if (me?.isAnonymous) body = <ContinueAnonymous />;
  else if (me) body = <AccountStart />;
  else body = <AnonymousStart />;

  return (
    <div className="mx-auto flex w-full max-w-narrow flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <Intro />
      {body}
      <p className="text-sm text-ink-muted">
        Vil du hellere se klinikkerne først?{" "}
        <Link href="/klinikker" className="font-semibold text-brand-700">
          Gå til klinikoversigten
        </Link>
        .
      </p>
    </div>
  );
}
