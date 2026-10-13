"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/views/components/ui/alert";
import { Button } from "@/views/components/ui/button";
import { Card } from "@/views/components/ui/card";
import { cx } from "@/views/components/ui/cx";
import { TextField } from "@/views/components/ui/text-field";
import { LoadState } from "@/views/components/ui/load-state";
import { SaveBar } from "@/views/components/ui/save-bar";
import { useLoad } from "@/views/utils/use-load";
import { apiRequest } from "@/views/utils/api-client";
import { useSaveState } from "@/views/utils/use-save-state";
import { WEEKDAYS, WEEKDAY_LABEL } from "@/lib/constants/clinics";
import { putOpeningHoursSchema } from "@/lib/schemas/clinics";
import type { OpeningHoursDto } from "@/lib/types/clinics";

type Window = { key: number; weekday: number; opensAt: string; closesAt: string; isEmergency: boolean };

const DEFAULT_OPENS = "08:00";
const DEFAULT_CLOSES = "16:00";
const WORKDAYS = [1, 2, 3, 4, 5];

const loadHours = async () => (await apiRequest<{ hours: OpeningHoursDto[] }>("/api/clinics/me/opening-hours")).hours;

let nextKey = 1;
const fromDto = (hours: OpeningHoursDto[]): Window[] => hours.map((h) => ({ ...h, key: nextKey++ }));
// Stabil sammenligning uden den løbende nøgle.
const snapshot = (windows: Window[]) =>
  JSON.stringify(windows.map(({ weekday, opensAt, closesAt, isEmergency }) => ({ weekday, opensAt, closesAt, isEmergency })));

// Ugeskema med åbningstider og akutvinduer (architecture 4.3 `clinic_opening_hours`, 10.8).
export function OpeningHoursForm() {
  const { data, error, loading, reload } = useLoad(loadHours);
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;
  return <HoursEditor initial={data} />;
}

function HoursEditor({ initial }: { initial: OpeningHoursDto[] }) {
  const [windows, setWindows] = useState(() => fromDto(initial));
  const [savedSnapshot, setSavedSnapshot] = useState(() => snapshot(windows));
  const dirty = snapshot(windows) !== savedSnapshot;
  const saveState = useSaveState(dirty);

  function addWindow(weekday: number) {
    setWindows((current) => {
      const last = current.filter((w) => w.weekday === weekday && !w.isEmergency).at(-1);
      // Et nyt tidsrum starter, hvor det forrige slutter (fx efter frokost), ellers på standardtider.
      const opensAt = last && last.closesAt < "20:00" ? last.closesAt : DEFAULT_OPENS;
      const closesAt = last && last.closesAt < "20:00" ? "20:00" : DEFAULT_CLOSES;
      return [...current, { key: nextKey++, weekday, opensAt, closesAt, isEmergency: false }];
    });
  }

  function updateWindow(key: number, patch: Partial<Window>) {
    setWindows((current) => current.map((w) => (w.key === key ? { ...w, ...patch } : w)));
  }

  function removeWindow(key: number) {
    setWindows((current) => current.filter((w) => w.key !== key));
  }

  function fillWorkdays() {
    setWindows((current) => [
      ...current.filter((w) => !WORKDAYS.includes(w.weekday)),
      ...WORKDAYS.map((weekday) => ({ key: nextKey++, weekday, opensAt: DEFAULT_OPENS, closesAt: DEFAULT_CLOSES, isEmergency: false })),
    ]);
  }

  function copyMondayToWorkdays() {
    setWindows((current) => {
      const monday = current.filter((w) => w.weekday === 1);
      return [
        ...current.filter((w) => !WORKDAYS.includes(w.weekday)),
        ...monday,
        ...WORKDAYS.slice(1).flatMap((weekday) => monday.map((w) => ({ ...w, key: nextKey++, weekday }))),
      ];
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const hours = [...windows]
      .sort((a, b) => a.weekday - b.weekday || a.opensAt.localeCompare(b.opensAt))
      .map(({ weekday, opensAt, closesAt, isEmergency }) => ({ weekday, opensAt, closesAt, isEmergency }));
    const parsed = putOpeningHoursSchema.safeParse({ hours });
    if (!parsed.success) {
      saveState.setError(parsed.error.issues[0]?.message ?? "Tjek åbningstiderne.");
      return;
    }
    await saveState.save(async () => {
      const result = await apiRequest<{ hours: OpeningHoursDto[] }>("/api/clinics/me/opening-hours", {
        method: "PUT",
        body: parsed.data,
      });
      const next = fromDto(result.hours);
      setWindows(next);
      setSavedSnapshot(snapshot(next));
    });
  }

  const hasMonday = windows.some((w) => w.weekday === 1);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <Alert tone="info" title="Akutvindue">
        Sæt flueben ved “Akut”, hvis tidsrummet kun er til akutte patienter. Akutydelser kan også bookes i de almindelige
        åbningstider. Dage uden tidsrum er lukket.
      </Alert>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="secondary" onClick={fillWorkdays}>
          Hverdage {DEFAULT_OPENS}-{DEFAULT_CLOSES}
        </Button>
        <Button variant="secondary" onClick={copyMondayToWorkdays} disabled={!hasMonday}>
          Kopiér mandag til tirsdag-fredag
        </Button>
      </div>

      <ul className="grid gap-3">
        {WEEKDAYS.map((weekday) => {
          const dayWindows = windows.filter((w) => w.weekday === weekday);
          return (
            <li key={weekday}>
              <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-6 sm:p-5">
                <h2 className="text-lg font-semibold text-ink sm:w-28 sm:pt-3">{WEEKDAY_LABEL[weekday]}</h2>
                <div className="flex flex-1 flex-col gap-3">
                  {dayWindows.length === 0 && <p className="text-base text-ink-muted sm:pt-3">Lukket</p>}
                  {dayWindows.map((w) => (
                    <WindowRow
                      key={w.key}
                      window={w}
                      dayLabel={WEEKDAY_LABEL[weekday]}
                      onChange={(patch) => updateWindow(w.key, patch)}
                      onRemove={() => removeWindow(w.key)}
                    />
                  ))}
                  <Button variant="ghost" className="self-start" onClick={() => addWindow(weekday)}>
                    + Tilføj tidsrum
                  </Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      <SaveBar {...saveState.props} label="Gem åbningstider" />
    </form>
  );
}

function WindowRow({
  window: w,
  dayLabel,
  onChange,
  onRemove,
}: {
  window: Window;
  dayLabel: string;
  onChange: (patch: Partial<Window>) => void;
  onRemove: () => void;
}) {
  return (
    <div className={cx("flex flex-col gap-3 rounded-control border p-3", w.isEmergency ? "border-warning-line bg-warning-bg" : "border-line")}>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          type="time"
          label={<><span className="sr-only">{dayLabel}: </span>Åbner</>}
          value={w.opensAt}
          onChange={(e) => onChange({ opensAt: e.target.value })}
          required
        />
        <TextField
          type="time"
          label={<><span className="sr-only">{dayLabel}: </span>Lukker</>}
          value={w.closesAt}
          onChange={(e) => onChange({ closesAt: e.target.value })}
          required
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base text-ink">
          <input type="checkbox" checked={w.isEmergency} onChange={(e) => onChange({ isEmergency: e.target.checked })} className="size-5 accent-brand-600" />
          <span>
            <span className="sr-only">{dayLabel}: </span>Akutvindue
          </span>
        </label>
        <Button variant="danger-outline" onClick={onRemove} className="min-h-11">
          <span className="sr-only">{dayLabel}: </span>Fjern
        </Button>
      </div>
    </div>
  );
}
