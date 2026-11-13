"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { LoadState } from "@/components/ui/load-state";
import { StatusMessage } from "@/components/ui/status-message";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { useAction } from "@/platform/ui-utils/use-action";
import { useLoad } from "@/platform/ui-utils/use-load";
import { loadClinic } from "@/features/clinics/utils/clinic-loaders";
import { upcomingHolidays } from "@/lib/common/domain/holidays";
import { toClinicDate } from "@/lib/common/domain/time";
import { formatDate } from "@/lib/common/domain/format";
import type { OwnClinicDto } from "@/lib/clinics/types/clinics";

// Helligdage (clinics 6.7): som udgangspunkt holder klinikken lukket på danske helligdage; patienterne kan ikke booke dem.
// Klinikken kan vælge at have åbent. Valget gemmes straks (PATCH /api/clinics/me). Søndag er lukket, når ugeskemaet ikke har
// tider om søndagen.
export function HolidayClosing() {
  const { data, error, loading, reload } = useLoad(loadClinic);
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;
  return <HolidayEditor initial={data.openOnHolidays} />;
}

function HolidayEditor({ initial }: { initial: boolean }) {
  const [closed, setClosed] = useState(!initial);
  const { busy, message, run } = useAction();
  const holidays = upcomingHolidays(toClinicDate(new Date()), 6);

  const onChange = (next: boolean) =>
    run(async () => {
      const clinic = await apiRequest<OwnClinicDto>("/api/clinics/me", { method: "PATCH", body: { openOnHolidays: !next } });
      setClosed(!clinic.openOnHolidays);
      return clinic.openOnHolidays ? "Gemt: I har åbent på helligdage efter ugeskemaet." : "Gemt: I holder lukket på helligdage.";
    });

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-ink">Helligdage</h2>
        <p className="text-sm text-ink-muted">Søndag er lukket, så længe ugeskemaet ikke har tider om søndagen. Lørdag følger ugeskemaet.</p>
      </div>
      <CheckboxField
        label="Lukket på helligdage"
        description="Patienterne kan ikke booke på danske helligdage, også selvom dagen har åbningstider i ugeskemaet."
        checked={closed}
        selected={closed}
        disabled={busy}
        onChange={(e) => void onChange(e.target.checked)}
      />
      <StatusMessage message={message} />
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-ink">De næste helligdage</h3>
        <ul className="grid gap-1 text-sm text-ink sm:grid-cols-2" data-testid="helligdage">
          {holidays.map((holiday) => (
            <li key={holiday.date}>
              {holiday.name}: {formatDate(`${holiday.date}T12:00:00Z`)}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
