import { WEEKDAYS, WEEKDAY_LABEL } from "@/lib/clinics/constants/clinics";
import type { OpeningHoursDto } from "@/lib/clinics/types/clinics";
import { formatClock } from "@/platform/ui-utils/format";

// Åbningstider pr. ugedag. Akutvinduer er tider, hvor klinikken tager imod akutte patienter (architecture 4.3).
export function OpeningHours({ hours }: { hours: OpeningHoursDto[] }) {
  if (hours.length === 0) {
    return <p className="text-base text-ink-muted">Klinikken har ikke angivet åbningstider.</p>;
  }
  const hasEmergency = hours.some((h) => h.isEmergency);
  return (
    <div className="flex flex-col gap-2">
      <dl className="flex flex-col divide-y divide-line">
        {WEEKDAYS.map((weekday) => {
          const windows = hours
            .filter((h) => h.weekday === weekday)
            .sort((a, b) => a.opensAt.localeCompare(b.opensAt));
          return (
            <div key={weekday} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:justify-between sm:gap-4">
              <dt className="text-base font-semibold text-ink">{WEEKDAY_LABEL[weekday]}</dt>
              <dd className="text-base text-ink sm:text-right">
                {windows.length === 0 ? (
                  <span className="text-ink-muted">Lukket</span>
                ) : (
                  <ul>
                    {windows.map((w) => (
                      <li key={`${w.opensAt}-${w.isEmergency}`}>
                        {formatClock(w.opensAt)}–{formatClock(w.closesAt)}
                        {w.isEmergency && <span className="font-semibold text-warning-ink"> (akut)</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {hasEmergency && <p className="text-sm text-ink-muted">Tider markeret “akut” er reserveret til akutte patienter.</p>}
    </div>
  );
}
