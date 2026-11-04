"use client";

import { useCallback, useEffect, useState } from "react";
import { CLINIC_EMPTY_TEXT, CLINIC_SEARCH_LABEL, CLINIC_STATUS_FILTER_ALL } from "@/lib/admin/constants/admin";
import type { AdminClinicDto } from "@/lib/admin/types/admin";
import { CLINIC_STATUS_LABEL } from "@/lib/clinics/constants/clinics";
import type { ClinicStatus } from "@/lib/clinics/types/clinics";
import { FilterChips } from "@/components/ui/filter-chips";
import { LoadState } from "@/components/ui/load-state";
import { TextField } from "@/components/ui/text-field";
import { AdminClinicRow } from "@/features/admin/components/admin-clinic-row";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { useLoad } from "@/platform/ui-utils/use-load";

type StatusFilter = ClinicStatus | "all";

// Verificeret først i filteret: det er det, admin oftest leder efter.
const FILTER_ORDER: ClinicStatus[] = ["verified", "registered", "imported", "removed"];
const OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: CLINIC_STATUS_FILTER_ALL },
  ...FILTER_ORDER.map((status) => ({ value: status, label: CLINIC_STATUS_LABEL[status] })),
];

// Søg (navn, by eller CVR) og filtrer på status. Højst 200 rækker, ingen sidevisning (admin 6.4).
export function AdminClinics() {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [updated, setUpdated] = useState<Record<string, AdminClinicDto>>({});

  // Søgningen sendes først, når der er holdt en kort pause i skrivningen.
  useEffect(() => {
    const timer = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (q) params.set("q", q);
    const query = params.toString();
    return (await apiRequest<{ clinics: AdminClinicDto[] }>(`/api/admin/clinics${query ? `?${query}` : ""}`)).clinics;
  }, [status, q]);
  const { data, loading, error, reload } = useLoad(load);

  // En ændret klinik opdateres på stedet, og listen hentes igen, så filteret passer (fx forsvinder den fra "Verificeret").
  function onChanged(clinic: AdminClinicDto) {
    setUpdated((current) => ({ ...current, [clinic.id]: clinic }));
    reload();
  }

  return (
    <div className="flex flex-col gap-5">
      <TextField label={CLINIC_SEARCH_LABEL} type="search" value={input} onChange={(event) => setInput(event.target.value)} maxLength={100} autoComplete="off" />
      <FilterChips label="Status" options={OPTIONS} value={status} onChange={setStatus} />
      {!data ? (
        <LoadState loading={loading} error={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <p className="text-base text-ink-muted" data-testid="admin-klinikker-tom">
          {CLINIC_EMPTY_TEXT}
        </p>
      ) : (
        <ul className="flex flex-col gap-4" aria-label="Klinikker">
          {data.map((clinic) => (
            <AdminClinicRow key={clinic.id} clinic={updated[clinic.id] ?? clinic} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </div>
  );
}
