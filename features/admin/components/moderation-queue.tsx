"use client";

import { useCallback, useState } from "react";
import {
  MODERATION_EMPTY_TEXT,
  MODERATION_FILTER_LABEL,
  MODERATION_KINDS,
  MODERATION_KIND_LABEL,
  MODERATION_RECEIPT,
} from "@/lib/admin/constants/admin";
import type { AdminModerationItemDto, ModerationKind } from "@/lib/admin/types/admin";
import { MODERATION_STATUSES } from "@/lib/booking/constants/reviews";
import type { ModerationStatus } from "@/lib/booking/types/reviews";
import { Alert } from "@/components/ui/alert";
import { FilterChips } from "@/components/ui/filter-chips";
import { LoadState } from "@/components/ui/load-state";
import { ModerationCard } from "@/features/admin/components/moderation-card";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { useLoad } from "@/platform/ui-utils/use-load";

const KIND_OPTIONS = MODERATION_KINDS.map((value) => ({ value, label: MODERATION_KIND_LABEL[value] }));
const STATUS_OPTIONS = MODERATION_STATUSES.map((value) => ({ value, label: MODERATION_FILTER_LABEL[value] }));

// To faner (anmeldelser og klinikkers svar) og et filter på status. Ældste først; efter en handling forsvinder kortet fra
// filteret, og en kvittering viser, hvad der skete (admin 6.4).
export function ModerationQueue() {
  const [kind, setKind] = useState<ModerationKind>("review");
  const [status, setStatus] = useState<ModerationStatus>("pending");
  const [receipts, setReceipts] = useState<string[]>([]);
  const load = useCallback(
    async () => (await apiRequest<{ items: AdminModerationItemDto[] }>(`/api/admin/moderation?kind=${kind}&status=${status}`)).items,
    [kind, status],
  );
  const { data, loading, error, reload } = useLoad(load);

  function onDone(item: AdminModerationItemDto, decision: "approved" | "rejected") {
    setReceipts((current) => [`${MODERATION_RECEIPT[decision]}: ${item.clinic.name}`, ...current].slice(0, 3));
    reload();
  }

  function change<T>(setter: (value: T) => void) {
    return (value: T) => {
      setReceipts([]);
      setter(value);
    };
  }

  return (
    <div className="flex flex-col gap-5">
      <FilterChips label="Type" options={KIND_OPTIONS} value={kind} onChange={change(setKind)} />
      <FilterChips label="Status" options={STATUS_OPTIONS} value={status} onChange={change(setStatus)} />
      {receipts.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="moderation-kvittering">
          {receipts.map((text, index) => (
            <Alert key={`${text}-${index}`} tone="success">
              {text}
            </Alert>
          ))}
        </div>
      )}
      {!data ? (
        <LoadState loading={loading} error={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <p className="text-base text-ink-muted" data-testid="moderation-tom">
          {MODERATION_EMPTY_TEXT}
        </p>
      ) : (
        <ul className="flex flex-col gap-4" aria-label={MODERATION_KIND_LABEL[kind]}>
          {data.map((item) => (
            <ModerationCard key={`${item.kind}-${item.id}-${item.moderationStatus}`} item={item} onDone={onDone} />
          ))}
        </ul>
      )}
    </div>
  );
}
