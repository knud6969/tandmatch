"use client";

import { useState, type FormEvent } from "react";
import {
  LEAD_CLINIC_DECLINE_REASONS,
  LEAD_COMMENT_MAX_CHARS,
  LEAD_DECLINE_NOTE_MAX_CHARS,
  LEAD_DECLINE_REASON_LABEL,
} from "@/lib/constants/leads";
import { leadDecisionSchema } from "@/lib/schemas/leads";
import type { ClinicLeadDetailDto } from "@/lib/types/leads";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { StatusMessage } from "@/components/ui/status-message";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, ApiRequestError } from "@/platform/ui-utils/api-client";
import { parseWholeKr } from "@/platform/ui-utils/format";
import { useAction } from "@/platform/ui-utils/use-action";

type Mode = "idle" | "comment" | "decline";
type ClinicDeclineReason = (typeof LEAD_CLINIC_DECLINE_REASONS)[number];

type LeadDecisionProps = {
  leadId: string;
  onDecided: (lead: ClinicLeadDetailDto) => void;
  // Leadet er ikke længere afventende (fx trukket tilbage, mens kortet var åbent): hent det igen.
  onStale: () => void;
  // Akut-lead med en konkret ønsket tid: tiden bliver booket ved accept.
  hasRequestedTime: boolean;
};

// Klinikkens beslutning (architecture 6.3): højst to tryk efter åbning. Accepter er ét tryk; Accepter med kommentar og Afvis
// åbner en kort formular med ét tryk til at sende. clinic_left kan ikke vælges (sættes kun af systemet).
export function LeadDecision({ leadId, onDecided, onStale, hasRequestedTime }: LeadDecisionProps) {
  const [mode, setMode] = useState<Mode>("idle");
  const [comment, setComment] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [reason, setReason] = useState<ClinicDeclineReason>("no_capacity");
  const [note, setNote] = useState("");
  const [stale, setStale] = useState(false);
  const [errors, setErrors] = useState<{ comment?: string; price?: string; note?: string }>({});
  const action = useAction();

  async function post(payload: unknown): Promise<boolean> {
    return action.run(async () => {
      try {
        const lead = await apiRequest<ClinicLeadDetailDto>(`/api/leads/${leadId}/decision`, { method: "POST", body: payload });
        onDecided(lead);
      } catch (error) {
        if (error instanceof ApiRequestError && error.code === "LEAD_NOT_PENDING") setStale(true);
        throw error;
      }
    });
  }

  function acceptPlain() {
    void post({ decision: "accept" });
  }

  async function submitComment(event: FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    const trimmed = comment.trim();
    if (trimmed === "") next.comment = "Skriv en kommentar til patienten.";
    const min = priceMin.trim() === "" ? undefined : parseWholeKr(priceMin);
    const max = priceMax.trim() === "" ? undefined : parseWholeKr(priceMax);
    if (min === null || max === null) next.price = "Angiv prisen i hele kroner.";
    else if ((min === undefined) !== (max === undefined)) next.price = "Angiv både laveste og højeste pris, eller lad begge være tomme.";
    const payload = {
      decision: "accept" as const,
      comment: trimmed,
      ...(min !== undefined && max !== undefined && min !== null && max !== null ? { quotedPriceMin: min, quotedPriceMax: max } : {}),
    };
    if (!next.comment && !next.price) {
      const parsed = leadDecisionSchema.safeParse(payload);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        if (issue.path[0] === "comment") next.comment = issue.message;
        else next.price = issue.message;
      }
    }
    setErrors(next);
    if (next.comment || next.price) return;
    await post(payload);
  }

  async function submitDecline(event: FormEvent) {
    event.preventDefault();
    const trimmed = note.trim();
    const payload = { decision: "decline" as const, reason, ...(trimmed === "" ? {} : { note: trimmed }) };
    const parsed = leadDecisionSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors({ note: parsed.error.issues[0].message });
      return;
    }
    setErrors({});
    await post(payload);
  }

  function open(next: Mode) {
    action.clear();
    setErrors({});
    setMode(next);
  }

  return (
    <section aria-labelledby="beslutning" className="flex flex-col gap-4" data-testid="beslutning">
      <h2 id="beslutning" className="text-xl font-semibold text-ink">
        Dit svar til patienten
      </h2>

      {stale && (
        <Alert tone="warning" role="alert">
          <p>Henvendelsen er allerede besvaret eller trukket tilbage. Genindlæs for at se den nyeste status.</p>
          <Button variant="secondary" className="mt-3" onClick={onStale}>
            Genindlæs
          </Button>
        </Alert>
      )}
      {!stale && <StatusMessage message={action.message} />}

      {mode === "idle" && (
        <div className="flex flex-col gap-3">
          <Button onClick={acceptPlain} disabled={action.busy}>
            Accepter
          </Button>
          <Button variant="secondary" onClick={() => open("comment")} disabled={action.busy}>
            Accepter med kommentar
          </Button>
          <Button variant="danger-outline" onClick={() => open("decline")} disabled={action.busy}>
            Afvis
          </Button>
          <p className="text-sm text-ink-muted">
            {hasRequestedTime ? "Tiden bliver booket, når du accepterer." : "Når du accepterer, kan patienten booke en tid i din kalender."}
          </p>
        </div>
      )}

      {mode === "comment" && (
        <form onSubmit={submitComment} className="flex flex-col gap-4" noValidate aria-label="Accepter med kommentar">
          <TextArea
            label="Kommentar til patienten"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={LEAD_COMMENT_MAX_CHARS}
            error={errors.comment}
            hint="Patienten kan læse kommentaren."
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold text-ink">Præciseret pris (valgfri)</legend>
            <p className="text-sm text-ink-muted">Angiv kun en pris, hvis du kan sige noget mere præcist end prislisten. Prisen er dit overslag, før du ser patienten.</p>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Laveste pris (kr.)" inputMode="numeric" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} />
              <TextField label="Højeste pris (kr.)" inputMode="numeric" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} />
            </div>
            {errors.price && <p className="text-sm font-medium text-danger-ink">{errors.price}</p>}
          </fieldset>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" disabled={action.busy}>
              {action.busy ? "Sender …" : "Send og accepter"}
            </Button>
            <Button variant="ghost" onClick={() => open("idle")} disabled={action.busy}>
              Annuller
            </Button>
          </div>
        </form>
      )}

      {mode === "decline" && (
        <form onSubmit={submitDecline} className="flex flex-col gap-4" noValidate aria-label="Afvis henvendelsen">
          <SelectField label="Årsag" value={reason} onChange={(e) => setReason(e.target.value as ClinicDeclineReason)}>
            {LEAD_CLINIC_DECLINE_REASONS.map((value) => (
              <option key={value} value={value}>
                {LEAD_DECLINE_REASON_LABEL[value]}
              </option>
            ))}
          </SelectField>
          <TextArea
            label="Note til patienten (valgfri)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={LEAD_DECLINE_NOTE_MAX_CHARS}
            error={errors.note}
            hint="Patienten kan se både årsagen og noten. Skriv ikke noget, du ikke vil have patienten til at læse."
            className="min-h-24"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" variant="danger" disabled={action.busy}>
              {action.busy ? "Sender …" : "Send afvisning"}
            </Button>
            <Button variant="ghost" onClick={() => open("idle")} disabled={action.busy}>
              Annuller
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
