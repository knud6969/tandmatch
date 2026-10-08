"use client";

import { useState, type Ref } from "react";
import { Alert } from "@/views/components/ui/alert";
import { Badge } from "@/views/components/ui/badge";
import { Button, LinkButton } from "@/views/components/ui/button";
import { ChoiceGroup } from "@/views/components/ui/choice-group";
import { TextField } from "@/views/components/ui/text-field";
import { PatientSignupForm } from "@/views/components/auth/patient-signup-form";
import { ConsentGate } from "@/views/components/wizard/consent-gate";
import { StepFrame, StepNav, hasActiveConsent, type StepProps } from "@/views/components/wizard/wizard-shared";
import { ApiRequestError, apiRequest } from "@/views/utils/api-client";
import { apiErrorMessage } from "@/views/utils/api-errors";
import type { RequestDraftDto, SentRequestDto } from "@/lib/types/requests";

const DISTANCE_OPTIONS = [
  { value: "10", label: "Op til 10 km" },
  { value: "25", label: "Op til 25 km (anbefalet)" },
  { value: "50", label: "Op til 50 km" },
];

type SendStepProps = StepProps & {
  headingRef: Ref<HTMLHeadingElement>;
  refreshSession: () => Promise<void>;
};

type SentResult = { recipientCount: number; expiresAt: string | null };

const dateFormat: Intl.DateTimeFormatOptions = { dateStyle: "long" };

// Trin 6-7: område, konto (kun anonyme), samtykke til deling og afsendelse (architecture 7.1, 10.4).
export function SendStep({
  draft,
  onDraftChange,
  reloadDraft,
  consents,
  reloadConsents,
  isAnonymous,
  goTo,
  headingRef,
  refreshSession,
}: SendStepProps) {
  const [postalCode, setPostalCode] = useState(draft.postalCode ?? "");
  const [postalError, setPostalError] = useState<string | null>(null);
  const [savingPostal, setSavingPostal] = useState(false);
  const [distanceError, setDistanceError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<{ tone: "warning" | "danger"; text: string } | null>(null);
  const [sent, setSent] = useState<SentResult | null>(null);

  const hasHealthConsent = hasActiveConsent(consents, "health_data_sharing");
  const checks = [
    { label: "Opsummeringen er godkendt", ok: draft.summaryApprovedAt !== null },
    { label: "Postnummer er angivet", ok: draft.postalCode !== null },
    { label: "Konto er oprettet", ok: !isAnonymous },
    { label: "Samtykke til deling med tandlæger", ok: hasHealthConsent },
  ];
  const ready = checks.every((check) => check.ok);

  async function savePostal() {
    if (!/^\d{4}$/.test(postalCode.trim())) {
      setPostalError("Angiv et gyldigt postnummer med 4 cifre.");
      return;
    }
    setSavingPostal(true);
    setPostalError(null);
    try {
      const next = await apiRequest<RequestDraftDto>(`/api/requests/${draft.id}`, {
        method: "PATCH",
        body: { postalCode: postalCode.trim() },
      });
      onDraftChange(next);
    } catch (err) {
      setPostalError(apiErrorMessage(err));
    } finally {
      setSavingPostal(false);
    }
  }

  async function chooseDistance(value: string) {
    setDistanceError(null);
    try {
      const next = await apiRequest<RequestDraftDto>(`/api/requests/${draft.id}`, {
        method: "PATCH",
        body: { maxDistanceKm: Number(value) },
      });
      onDraftChange(next);
    } catch (err) {
      setDistanceError(apiErrorMessage(err));
    }
  }

  async function send() {
    setSending(true);
    setSendError(null);
    try {
      const result = await apiRequest<SentRequestDto>(
        `/api/requests/${draft.id}/send`,
        { method: "POST" },
      );
      setSent({ recipientCount: result.recipientCount, expiresAt: result.expiresAt });
    } catch (err) {
      // Ingen match er ikke en fejl i systemet: patienten får en klar besked og kan vælge større afstand.
      const noMatches = err instanceof ApiRequestError && err.code === "NO_MATCHES";
      setSendError({ tone: noMatches ? "warning" : "danger", text: apiErrorMessage(err) });
      if (!noMatches) await reloadDraft();
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    const expires = sent.expiresAt ? new Date(sent.expiresAt).toLocaleDateString("da-DK", dateFormat) : null;
    return (
      <StepFrame index={6} title="Din forespørgsel er sendt" headingRef={headingRef}>
        <Alert tone="success" title="Tak, din forespørgsel er sendt" role="status">
          <p>
            Den er sendt til {sent.recipientCount} {sent.recipientCount === 1 ? "tandlæge" : "tandlæger"}
            {expires ? `, og den gælder til ${expires}` : ""}. Du får svar fra tandlægerne under dine forespørgsler.
          </p>
        </Alert>
        <LinkButton href="/patient" className="w-full sm:w-auto">
          Gå til mine forespørgsler
        </LinkButton>
      </StepFrame>
    );
  }

  return (
    <StepFrame index={6} title="Område og afsendelse" headingRef={headingRef}>
      <section aria-labelledby="omraade-heading" className="flex flex-col gap-4">
        <h3 id="omraade-heading" className="text-lg font-semibold text-ink">
          Hvor skal tandlægerne ligge?
        </h3>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <TextField
              label="Postnummer"
              name="postalCode"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={4}
              value={postalCode}
              onChange={(event) => setPostalCode(event.target.value)}
              hint="Vi bruger kun postnummeret til at finde tandlæger i nærheden. Din adresse gemmes ikke."
              error={postalError ?? undefined}
            />
          </div>
          <Button variant="secondary" onClick={() => void savePostal()} disabled={savingPostal} className="w-full sm:w-auto">
            {savingPostal ? "Gemmer …" : "Gem postnummer"}
          </Button>
        </div>
        {distanceError && (
          <Alert tone="danger" role="alert">
            {distanceError}
          </Alert>
        )}
        <ChoiceGroup
          legend="Hvor langt må tandlægen være fra dig?"
          options={DISTANCE_OPTIONS}
          value={DISTANCE_OPTIONS.some((option) => option.value === String(draft.maxDistanceKm)) ? String(draft.maxDistanceKm) : null}
          onChange={(value) => void chooseDistance(value)}
        />
      </section>

      <section aria-labelledby="overblik-heading" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
        <h3 id="overblik-heading" className="text-lg font-semibold text-ink">
          Det er klar til afsendelse, når alt er grønt
        </h3>
        <ul className="flex flex-col gap-2">
          {checks.map((check) => (
            <li key={check.label} className="flex items-center justify-between gap-3 text-base text-ink">
              <span>{check.label}</span>
              {check.ok ? <Badge tone="brand">Klar</Badge> : <Badge tone="warning">Mangler</Badge>}
            </li>
          ))}
        </ul>
      </section>

      {isAnonymous ? (
        <section aria-labelledby="konto-heading" className="flex flex-col gap-4">
          <h3 id="konto-heading" className="text-lg font-semibold text-ink">
            Opret en konto for at sende
          </h3>
          <p className="text-base leading-relaxed text-ink-muted">
            Tandlæger kan først se din forespørgsel, når du har en konto. Din samtale, dine svar og dine billeder følger
            med til kontoen, så du ikke skal starte forfra.
          </p>
          <PatientSignupForm
            onDone={async () => {
              await refreshSession();
              await reloadDraft();
              await reloadConsents();
            }}
          />
        </section>
      ) : (
        !hasHealthConsent && (
          <ConsentGate
            type="health_data_sharing"
            title="Giv samtykke til deling med tandlæger"
            intro={
              <p>
                Når du sender, deles din godkendte opsummering, dine svar og eventuelle billeder med de tandlæger, der
                matcher din forespørgsel. Chatten deles ikke. Vilkårene er ikke det samme som dette samtykke.
              </p>
            }
            buttonLabel="Giv samtykke til deling"
            onGranted={reloadConsents}
          />
        )
      )}

      {!isAnonymous && (
        <section aria-labelledby="send-heading" className="flex flex-col gap-4">
          <h3 id="send-heading" className="text-lg font-semibold text-ink">
            Send forespørgslen
          </h3>
          {sendError && (
            <Alert tone={sendError.tone} role="alert" title={sendError.tone === "warning" ? "Ingen tandlæger endnu" : undefined}>
              <p>{sendError.text}</p>
              {sendError.tone === "warning" && (
                <p className="mt-2">Vælg en større afstand ovenfor og prøv igen. Din forespørgsel er gemt, til du sender den.</p>
              )}
            </Alert>
          )}
          {!ready && (
            <p className="text-sm text-ink-muted">Der mangler et eller flere trin, før forespørgslen kan sendes. Se listen ovenfor.</p>
          )}
          <Button fullWidth className="sm:w-auto" disabled={!ready || sending} onClick={() => void send()}>
            {sending ? "Sender …" : "Send forespørgsel til tandlæger"}
          </Button>
        </section>
      )}

      <StepNav onBack={() => goTo("opsummering")} />
    </StepFrame>
  );
}
