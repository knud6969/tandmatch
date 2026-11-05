"use client";

import { useState } from "react";
import {
  CLINIC_ACTION_CANCEL_LABEL,
  CLINIC_ACTION_CONFIRM_LABEL,
  CLINIC_ACTION_REASON_LABEL,
  CLINIC_HAS_ACCOUNT,
  CLINIC_NO_OWNER_TEXT,
  CLINIC_OWNER_LABEL,
  CLINIC_VERIFY_REASON_LABEL,
  CLINIC_PAUSE_CONSEQUENCE,
  CLINIC_PAUSE_LABEL,
  CLINIC_VERIFY_CONSEQUENCE,
  CLINIC_VERIFY_LABEL,
  ADMIN_REASON_MAX_CHARS,
} from "@/lib/admin/constants/admin";
import type { AdminClinicDto } from "@/lib/admin/types/admin";
import { CLINIC_STATUS_LABEL } from "@/lib/clinics/constants/clinics";
import { formatDate } from "@/lib/common/domain/format";
import { toClinicDate } from "@/lib/common/domain/time";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status-message";
import { TextArea } from "@/components/ui/text-area";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { useAction } from "@/platform/ui-utils/use-action";

const STATUS_TONE: Record<AdminClinicDto["status"], BadgeTone> = { verified: "brand", registered: "warning", imported: "neutral", removed: "danger" };

type Change = "verified" | "registered";

// Én klinik i admins liste: grunddata, ejerens e-mail, status og de handlinger, statussen tillader. Begge handlinger kræver en
// bekræftelse; "Verificér" kræver en begrundelse (H1), "Sæt på pause" har en valgfri og viser konsekvensen først.
export function AdminClinicRow({ clinic, onChanged }: { clinic: AdminClinicDto; onChanged: (clinic: AdminClinicDto) => void }) {
  const [pending, setPending] = useState<Change | null>(null);
  const [reason, setReason] = useState("");
  const action = useAction();

  async function confirm() {
    if (!pending) return;
    const ok = await action.run(async () => {
      const updated = await apiRequest<AdminClinicDto>(`/api/admin/clinics/${clinic.id}/status`, {
        method: "POST",
        body: reason.trim() ? { status: pending, reason: reason.trim() } : { status: pending },
      });
      onChanged(updated);
    });
    if (ok) {
      setPending(null);
      setReason("");
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5" data-testid="admin-klinik" data-status={clinic.status}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="break-words text-lg font-semibold text-ink">{clinic.name}</h2>
        <Badge tone={STATUS_TONE[clinic.status]}>{CLINIC_STATUS_LABEL[clinic.status]}</Badge>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-ink-muted sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="font-semibold text-ink">By</dt>
          <dd>{clinic.postalCode} {clinic.city}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">CVR</dt>
          <dd>{clinic.cvr ?? "–"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="font-semibold text-ink">{CLINIC_OWNER_LABEL}</dt>
          <dd className="break-all" data-testid="admin-ejer">{clinic.ownerEmail ?? CLINIC_NO_OWNER_TEXT}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">Har konto</dt>
          <dd>{clinic.hasOwner ? CLINIC_HAS_ACCOUNT.yes : CLINIC_HAS_ACCOUNT.no}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">Verificeret</dt>
          <dd>{clinic.verifiedAt ? formatDate(toClinicDate(clinic.verifiedAt)) : "–"}</dd>
        </div>
      </dl>

      {pending ? (
        <div className="flex flex-col gap-3" role="group" aria-label={`${pending === "verified" ? CLINIC_VERIFY_LABEL : CLINIC_PAUSE_LABEL} ${clinic.name}`}>
          <Alert tone={pending === "verified" ? "info" : "warning"}>{pending === "verified" ? CLINIC_VERIFY_CONSEQUENCE : CLINIC_PAUSE_CONSEQUENCE}</Alert>
          <TextArea label={pending === "verified" ? CLINIC_VERIFY_REASON_LABEL : CLINIC_ACTION_REASON_LABEL} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={ADMIN_REASON_MAX_CHARS} rows={2} />
          <StatusMessage message={action.message} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant={pending === "verified" ? "primary" : "danger"} onClick={confirm} disabled={action.busy || (pending === "verified" && reason.trim() === "")}>
              {action.busy ? "Gemmer …" : CLINIC_ACTION_CONFIRM_LABEL}
            </Button>
            <Button variant="ghost" onClick={() => setPending(null)} disabled={action.busy}>
              {CLINIC_ACTION_CANCEL_LABEL}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <StatusMessage message={action.message} />
          {(clinic.canVerify || clinic.canPause) && (
            <div className="flex flex-col gap-2 sm:flex-row">
              {clinic.canVerify && <Button onClick={() => setPending("verified")}>{CLINIC_VERIFY_LABEL}</Button>}
              {clinic.canPause && (
                <Button variant="danger-outline" onClick={() => setPending("registered")}>
                  {CLINIC_PAUSE_LABEL}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </li>
  );
}
