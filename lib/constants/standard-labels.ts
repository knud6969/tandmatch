import type { StandardService } from "@/lib/types/common";
import type { PriceAccuracy } from "@/lib/types/standard";

// Visningsnavne for standard-sporet (architecture 4.2, [ÅBEN] endelig liste).
export const SERVICE_OPTIONS: { value: StandardService; label: string }[] = [
  { value: "undersoegelse", label: "Undersøgelse" },
  { value: "tandrensning", label: "Tandrensning" },
  { value: "fyldning", label: "Fyldning" },
  { value: "akut_konsultation", label: "Akut konsultation" },
];

export function serviceLabel(value: StandardService): string {
  return SERVICE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

// Valgmuligheder i anmeldelsesformularen (spørgsmålet: "Svarede den endelige pris til prisoverslaget?").
export const PRICE_ACCURACY_OPTIONS: { value: PriceAccuracy; label: string }[] = [
  { value: "as_quoted", label: "Ja, prisen svarede til prisoverslaget" },
  { value: "slightly_higher", label: "Nej, den endelige pris var lidt højere" },
  { value: "much_higher", label: "Nej, den endelige pris var langt højere" },
];

export function priceAccuracyLabel(value: PriceAccuracy): string {
  switch (value) {
    case "as_quoted":
      return "Prisen svarede til prisoverslaget";
    case "slightly_higher":
      return "Den endelige pris var lidt højere";
    case "much_higher":
      return "Den endelige pris var langt højere";
  }
}
