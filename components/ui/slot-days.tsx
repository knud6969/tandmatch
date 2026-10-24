"use client";

import { useState } from "react";
import type { SlotDto } from "@/lib/clinics/types/clinics";
import { cx } from "@/components/ui/cx";
import { formatDay, formatTime } from "@/lib/common/domain/format";
import { groupByDay } from "@/platform/ui-utils/group-by-day";

const TIMES_PER_DAY = 6;

type SlotDaysProps = {
  slots: SlotDto[];
  // Højst så mange dage vises (uden = alle).
  maxDays?: number;
  // Med onSelect er tiderne knapper (booking); uden er de kun visning (klinikoversigten).
  selected?: string | null;
  onSelect?: (slot: SlotDto) => void;
};

// Ledige tider pr. dag, fælles for bookingsiden og klinikoversigten. Seks tider pr. dag, resten bag "Vis flere tider".
export function SlotDays({ slots, maxDays, selected = null, onSelect }: SlotDaysProps) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const allDays = groupByDay(slots, (slot) => slot.startsAt);
  const days = maxDays ? allDays.slice(0, maxDays) : allDays;

  return (
    <ul className="flex flex-col gap-4" data-testid="tidsliste">
      {days.map(([key, daySlots]) => {
        const open = expanded.includes(key);
        const shown = open ? daySlots : daySlots.slice(0, TIMES_PER_DAY);
        return (
          <li key={key} className="flex flex-col gap-2" data-testid="dag">
            <h3 className="text-base font-semibold text-ink first-letter:uppercase">{formatDay(daySlots[0].startsAt)}</h3>
            <ul className="flex flex-wrap gap-2">
              {shown.map((slot) => {
                const active = slot.startsAt === selected;
                const style = cx(
                  "inline-flex min-w-20 items-center justify-center rounded-pill px-4 text-base font-semibold ring-1 ring-inset",
                  active ? "bg-brand-600 text-on-brand ring-brand-600" : "bg-brand-50 text-brand-800 ring-brand-200",
                );
                return (
                  <li key={slot.startsAt}>
                    {onSelect ? (
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => onSelect(slot)}
                        data-testid="tid"
                        className={cx(style, "min-h-11 transition-colors", !active && "hover:bg-brand-100")}
                      >
                        {formatTime(slot.startsAt)}
                      </button>
                    ) : (
                      <span className={cx(style, "min-h-9")} data-testid="tid-visning">
                        {formatTime(slot.startsAt)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {daySlots.length > TIMES_PER_DAY && (
              <button
                type="button"
                aria-expanded={open}
                className="inline-flex min-h-11 w-fit items-center text-base font-semibold text-brand-700"
                onClick={() => setExpanded((list) => (open ? list.filter((k) => k !== key) : [...list, key]))}
              >
                {open ? "Vis færre tider" : `Vis ${daySlots.length - TIMES_PER_DAY} flere tider`}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
