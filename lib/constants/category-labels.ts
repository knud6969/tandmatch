import type { CosmeticCategory } from "@/lib/types/common";

// Visningsnavne for kosmetiske kategorier. Pladsholdere (architecture 4.2, [ÅBEN] endelig liste).
export const CATEGORY_OPTIONS: { value: CosmeticCategory; label: string }[] = [
  { value: "diastema", label: "Mellemrum mellem tænderne" },
  { value: "facings", label: "Facader (skaller)" },
  { value: "blegning", label: "Blegning" },
  { value: "retainer", label: "Retainer" },
  { value: "andet_kosmetisk", label: "Andet kosmetisk ønske" },
];

export function categoryLabel(value: CosmeticCategory): string {
  return CATEGORY_OPTIONS.find((option) => option.value === value)?.label ?? value;
}
