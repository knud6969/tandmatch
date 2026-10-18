import type { PriceRange } from "@/lib/types/common";

// Prisoverslaget en anmeldelse sammenlignes med (architecture 8.2): klinikkens præciserede pris på leadet, hvis den findes,
// ellers listepris-snapshottet på leadet, ellers intet. Begge ender er enten sat eller null (check-constraints på leads).
export function priceEstimate(quoted: PriceRange | null, list: PriceRange | null): PriceRange | null {
  return quoted ?? list ?? null;
}
