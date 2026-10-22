import type { ClinicPriceDto } from "@/lib/types/clinics";
import type { ServiceGroupDto } from "@/lib/types/services";
import { formatPriceRange } from "@/platform/ui-utils/format";

// Klinikkens prisliste grupperet efter kategori. Rækkefølgen følger kataloget; ukendte behandlinger samles til sidst.
export function PriceList({ prices, groups }: { prices: ClinicPriceDto[]; groups: ServiceGroupDto[] | null }) {
  if (prices.length === 0) {
    return <p className="text-base text-ink-muted">Klinikken har endnu ikke lagt en prisliste ind.</p>;
  }

  const bySlug = new Map(prices.map((price) => [price.serviceSlug, price]));
  const sections: { name: string; items: ClinicPriceDto[] }[] = [];
  const used = new Set<string>();
  for (const group of groups ?? []) {
    const items = group.services.flatMap((service) => {
      const price = bySlug.get(service.slug);
      return price ? [price] : [];
    });
    items.forEach((item) => used.add(item.serviceSlug));
    if (items.length > 0) sections.push({ name: group.name, items });
  }
  const rest = prices.filter((price) => !used.has(price.serviceSlug));
  if (rest.length > 0) sections.push({ name: sections.length > 0 ? "Andet" : "Behandlinger", items: rest });

  return (
    <div className="flex flex-col gap-5">
      {sections.map((section) => (
        <section key={section.name} aria-label={section.name} className="flex flex-col gap-1">
          <h3 className="text-base font-semibold text-ink">{section.name}</h3>
          <ul className="divide-y divide-line rounded-control border border-line">
            {section.items.map((item) => (
              <li key={item.serviceId} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="text-base text-ink">{item.serviceName}</p>
                  <p className="text-sm text-ink-muted">
                    Ca. {item.durationMin} min.{item.note && ` · ${item.note}`}
                  </p>
                </div>
                <p className="text-base font-semibold text-ink sm:text-right">{formatPriceRange(item.price.min, item.price.max)}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-sm text-ink-muted">
        Priser ifølge klinikkens prisliste. Klinikken laver den endelige vurdering, og den endelige pris kan afvige.
      </p>
    </div>
  );
}
