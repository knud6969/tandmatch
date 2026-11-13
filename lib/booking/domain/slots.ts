import type { SlotDto } from "@/lib/clinics/types/clinics";
import { dayKey, formatDayLabel } from "@/lib/common/domain/format";

// Ledige tider pr. dag (architecture 10.10). Bruges af appens tidsvælger og klinikkens forslag til en akuttid (10.11).
export type SlotDay = { key: string; label: string; slots: SlotDto[] };

// Grupperer ledige tider efter dag i dansk tid, i tidsrækkefølge.
export function groupSlotsByDay(slots: SlotDto[]): SlotDay[] {
  const days = new Map<string, SlotDay>();
  for (const slot of [...slots].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const key = dayKey(slot.startsAt);
    const day = days.get(key) ?? { key, label: formatDayLabel(slot.startsAt), slots: [] };
    day.slots.push(slot);
    days.set(key, day);
  }
  return [...days.values()];
}
