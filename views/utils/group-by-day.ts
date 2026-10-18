import { toClinicDate } from "@/lib/domain/time";

// Samler elementer pr. dag i dansk tid (nøgle YYYY-MM-DD) i den rækkefølge, de kommer i. Bruges af ledige tider og kalender.
export function groupByDay<T>(items: readonly T[], timestampOf: (item: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = toClinicDate(timestampOf(item));
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return [...map.entries()];
}
