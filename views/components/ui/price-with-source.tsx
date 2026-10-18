import type { ReactNode } from "react";
import type { PriceRange } from "@/lib/types/common";
import { formatPriceRange } from "@/views/utils/format";

// Kilden, der står ved alle priser patienten ser (priser vises altid med kilde).
export const PRICE_SOURCE = "ifølge klinikkens prisliste";

type PriceWithSourceProps = {
  price: PriceRange;
  // Tekst foran kilden, fx "for dit valg,". Udelades, når kilden står alene.
  prefix?: string;
  // Anden kilde end klinikkens prisliste, fx den præciserede pris.
  source?: ReactNode;
  priceClassName?: string;
};

// En pris med sin kilde ("1.200–1.800 kr. ifølge klinikkens prisliste"). Priser vises aldrig uden kilde.
export function PriceWithSource({ price, prefix, source = PRICE_SOURCE, priceClassName = "font-semibold" }: PriceWithSourceProps) {
  return (
    <>
      <span className={priceClassName}>{formatPriceRange(price.min, price.max)}</span>{" "}
      <span className="text-ink-muted">
        {prefix ? `${prefix} ` : ""}
        {source}
      </span>
    </>
  );
}
