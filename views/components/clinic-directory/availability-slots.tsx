"use client";

import { useCallback, useMemo, useState } from "react";
import type { ClinicPriceDto, SlotDto } from "@/lib/types/clinics";
import { LoadState } from "@/views/components/ui/load-state";
import { SelectField } from "@/views/components/ui/select-field";
import { apiRequest } from "@/views/utils/api-client";
import { dayKey, formatDay, formatTime } from "@/views/utils/format";
import { useLoad } from "@/views/utils/use-load";

const DAYS_SHOWN = 5;
const TIMES_PER_DAY = 6;

// Ledige tider de næste 14 dage for en valgt behandling (architecture 6.7, GET /api/clinics/{id}/availability).
export function AvailabilitySlots({ clinicId, prices }: { clinicId: string; prices: ClinicPriceDto[] }) {
  const initial = prices.find((price) => price.serviceSlug === "undersoegelse") ?? prices[0];
  const [serviceId, setServiceId] = useState(initial?.serviceId ?? "");

  const loader = useCallback(
    async () =>
      serviceId
        ? (await apiRequest<{ slots: SlotDto[] }>(`/api/clinics/${clinicId}/availability?serviceId=${encodeURIComponent(serviceId)}`)).slots
        : [],
    [clinicId, serviceId],
  );
  const { data, loading, error, reload } = useLoad(loader);

  const days = useMemo(() => {
    const map = new Map<string, SlotDto[]>();
    for (const slot of data ?? []) {
      const key = dayKey(slot.startsAt);
      map.set(key, [...(map.get(key) ?? []), slot]);
    }
    return [...map.entries()].slice(0, DAYS_SHOWN);
  }, [data]);

  if (prices.length === 0) {
    return <p className="text-base text-ink-muted">Klinikken har ikke lagt behandlinger ind endnu, så vi kan ikke vise tider.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <SelectField label="Behandling" value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
        {prices.map((price) => (
          <option key={price.serviceId} value={price.serviceId}>
            {price.serviceName}
          </option>
        ))}
      </SelectField>
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {data && days.length === 0 && <p className="text-base text-ink-muted">Ingen ledige tider de næste 14 dage.</p>}
      {days.length > 0 && (
        <ul className="flex flex-col gap-3">
          {days.map(([key, slots]) => (
            <li key={key} className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold capitalize text-ink">{formatDay(slots[0].startsAt)}</p>
              <ul className="flex flex-wrap gap-2">
                {slots.slice(0, TIMES_PER_DAY).map((slot) => (
                  <li key={slot.startsAt} className="rounded-pill bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-800 ring-1 ring-inset ring-brand-200">
                    {formatTime(slot.startsAt)}
                  </li>
                ))}
                {slots.length > TIMES_PER_DAY && (
                  <li className="px-1 py-1.5 text-sm text-ink-muted">+ {slots.length - TIMES_PER_DAY} flere</li>
                )}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-ink-muted">Tiderne er vejledende og kan blive optaget. Klinikken bekræfter tiden.</p>
    </div>
  );
}
