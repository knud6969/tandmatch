"use client";

import { useCallback, useState, type FormEvent } from "react";
import { LEAD_COMMENT_MAX_CHARS } from "@/lib/leads/constants/leads";
import { EMERGENCY_HOLD_MINUTES } from "@/lib/booking/constants/bookings";
import { groupSlotsByDay } from "@/lib/booking/domain/slots";
import type { SlotDto } from "@/lib/clinics/types/clinics";
import { DAY_MS } from "@/lib/common/domain/time";
import { formatTime } from "@/lib/common/domain/format";
import { Button } from "@/components/ui/button";
import { LoadState } from "@/components/ui/load-state";
import { SelectField } from "@/components/ui/select-field";
import { TextArea } from "@/components/ui/text-area";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { useLoad } from "@/platform/ui-utils/use-load";

// Så langt frem klinikken ser ledige tider, når den foreslår en akuttid.
const PROPOSAL_DAYS = 3;

type ProposeTimeFormProps = {
  leadId: string;
  serviceId: string;
  busy: boolean;
  onSubmit: (payload: { decision: "accept"; proposedStartsAt: string; comment?: string }) => Promise<boolean>;
  onCancel: () => void;
};

// Klinikkens svar på en akut henvendelse (leads 10.11): vælg den tid, I kan tage patienten (egne ledige tider de næste dage),
// og evt. en kommentar. Tiden reserveres, til patienten bekræfter den.
export function ProposeTimeForm({ leadId, serviceId, busy, onSubmit, onCancel }: ProposeTimeFormProps) {
  const loader = useCallback(async () => {
    const from = new Date();
    const to = new Date(from.getTime() + PROPOSAL_DAYS * DAY_MS);
    const query = new URLSearchParams({ serviceId, from: from.toISOString(), to: to.toISOString() });
    return (await apiRequest<{ slots: SlotDto[] }>(`/api/leads/${leadId}/availability?${query}`)).slots;
  }, [leadId, serviceId]);
  const slots = useLoad(loader);
  const [startsAt, setStartsAt] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | undefined>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (startsAt === "") {
      setError("Vælg en tid.");
      return;
    }
    setError(undefined);
    const trimmed = comment.trim();
    const sent = await onSubmit({ decision: "accept", proposedStartsAt: startsAt, ...(trimmed === "" ? {} : { comment: trimmed }) });
    if (!sent) slots.reload();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate aria-label="Foreslå en tid">
      {!slots.data ? (
        <LoadState loading={slots.loading} error={slots.error} onRetry={slots.reload} />
      ) : slots.data.length === 0 ? (
        <p className="text-sm text-ink-muted">
          I har ingen ledige tider de næste {PROPOSAL_DAYS} dage i jeres åbningstider. Skriv til patienten, eller afvis henvendelsen.
        </p>
      ) : (
        <SelectField label="Tid til patienten" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} error={error} autoFocus>
          <option value="" disabled>
            Vælg tid
          </option>
          {groupSlotsByDay(slots.data).map((day) => (
            <optgroup key={day.key} label={day.label}>
              {day.slots.map((slot) => (
                <option key={slot.startsAt} value={slot.startsAt}>
                  {formatTime(slot.startsAt)}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectField>
      )}
      <TextArea
        label="Kommentar til patienten (valgfri)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={LEAD_COMMENT_MAX_CHARS}
        rows={2}
        className="min-h-16"
      />
      <p className="text-xs text-ink-muted">
        Tiden holdes i op til {EMERGENCY_HOLD_MINUTES} minutter, mens patienten bekræfter. Du ser navn og telefon, når tiden er bekræftet.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button type="submit" disabled={busy || !slots.data || slots.data.length === 0}>
          {busy ? "Sender …" : "Send forslag"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Annuller
        </Button>
      </div>
    </form>
  );
}
