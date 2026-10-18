"use client";

import { useCallback, useState } from "react";
import { MAX_AVAILABILITY_RANGE_DAYS } from "@/lib/constants/bookings";
import { EXAMINATION_SERVICE_SLUG } from "@/lib/constants/services";
import type { ClinicPriceDto, SlotDto } from "@/lib/types/clinics";
import { LoadState } from "@/views/components/ui/load-state";
import { SlotDays } from "@/views/components/ui/slot-days";
import { SelectField } from "@/views/components/ui/select-field";
import { apiRequest } from "@/views/utils/api-client";
import { useLoad } from "@/views/utils/use-load";

const DAYS_SHOWN = 5;

// Ledige tider i det næste døgnvindue (MAX_AVAILABILITY_RANGE_DAYS) for en valgt behandling (architecture 6.7, GET /api/clinics/{id}/availability).
export function AvailabilitySlots({ clinicId, prices }: { clinicId: string; prices: ClinicPriceDto[] }) {
  const initial = prices.find((price) => price.serviceSlug === EXAMINATION_SERVICE_SLUG) ?? prices[0];
  const [serviceId, setServiceId] = useState(initial?.serviceId ?? "");

  const loader = useCallback(
    async () =>
      serviceId
        ? (await apiRequest<{ slots: SlotDto[] }>(`/api/clinics/${clinicId}/availability?serviceId=${encodeURIComponent(serviceId)}`)).slots
        : [],
    [clinicId, serviceId],
  );
  const { data, loading, error, reload } = useLoad(loader);

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
      {data && data.length === 0 && <p className="text-base text-ink-muted">{`Ingen ledige tider de næste ${MAX_AVAILABILITY_RANGE_DAYS} dage.`}</p>}
      {data && data.length > 0 && <SlotDays slots={data} maxDays={DAYS_SHOWN} />}
      <p className="text-sm text-ink-muted">Tiderne er vejledende og kan blive optaget. Klinikken bekræfter tiden.</p>
    </div>
  );
}
