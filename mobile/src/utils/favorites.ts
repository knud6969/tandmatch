import { REMOVE_FAVORITE_LABEL, SAVE_FAVORITE_LABEL } from "@/lib/clinics/constants/favorites";

// Hjertet (mobile 13.12): tryk skifter med det samme og rulles tilbage ved fejl.

export const favoriteLabel = (saved: boolean) => (saved ? REMOVE_FAVORITE_LABEL : SAVE_FAVORITE_LABEL);

export type FavoriteCalls = { add: (clinicId: string) => Promise<void>; remove: (clinicId: string) => Promise<void> };

// Sættet af gemte id'er efter et skifte.
export function withFavorite(ids: ReadonlySet<string>, clinicId: string, saved: boolean): Set<string> {
  const next = new Set(ids);
  if (saved) next.add(clinicId);
  else next.delete(clinicId);
  return next;
}

// Skifter optimistisk: `apply` kaldes straks med det nye sæt. Fejler kaldet, rulles kun denne klinik tilbage i det nyeste sæt
// (`current`), så et andet tryk undervejs ikke fortrydes. Returnerer fejlen (eller null), så skærmen kan vise den.
export async function toggleFavorite(
  ids: ReadonlySet<string>,
  clinicId: string,
  calls: FavoriteCalls,
  apply: (next: Set<string>) => void,
  current: () => ReadonlySet<string> = () => ids,
): Promise<unknown> {
  const saved = !ids.has(clinicId);
  apply(withFavorite(ids, clinicId, saved));
  try {
    await (saved ? calls.add(clinicId) : calls.remove(clinicId));
    return null;
  } catch (error) {
    apply(withFavorite(current(), clinicId, !saved));
    return error;
  }
}
