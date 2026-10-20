import { StyleSheet, Text, View } from "react-native";
import type { ClinicPriceDto } from "@/lib/types/clinics";
import type { ServiceGroupDto } from "@/lib/types/services";
import { colors, fontSize, radius, spacing } from "~/theme";
import { PRICE_FINAL_NOTE, PRICE_SOURCE } from "~/utils/clinic-texts";
import { formatPriceRange } from "~/utils/format";

// Klinikkens prisliste grupperet efter kategori. Rækkefølgen følger kataloget; ukendte behandlinger samles til sidst.
export function PriceList({ prices, groups }: { prices: ClinicPriceDto[]; groups: ServiceGroupDto[] | null }) {
  if (prices.length === 0) return <Text style={styles.muted}>Klinikken har endnu ikke lagt en prisliste ind.</Text>;

  // Katalogets rækkefølge bruges til grupperingen; priser uden for kataloget kommer i en samlet gruppe til sidst.
  const bySlug = new Map(prices.map((p) => [p.serviceSlug, p]));
  const sections: { name: string; items: ClinicPriceDto[] }[] = [];
  const used = new Set<string>();
  for (const group of groups ?? []) {
    const items = group.services.flatMap((s) => (bySlug.has(s.slug) ? [bySlug.get(s.slug)!] : []));
    items.forEach((i) => used.add(i.serviceSlug));
    if (items.length > 0) sections.push({ name: group.name, items });
  }
  const rest = prices.filter((p) => !used.has(p.serviceSlug));
  if (rest.length > 0) sections.push({ name: sections.length > 0 ? "Andet" : "Behandlinger", items: rest });

  return (
    <View style={styles.wrap}>
      {sections.map((section) => (
        <View key={section.name} style={styles.group}>
          <Text style={styles.groupName}>{section.name}</Text>
          {section.items.map((item) => (
            <View key={item.serviceId} style={styles.row} accessible accessibilityLabel={`${item.serviceName}, ${formatPriceRange(item.price.min, item.price.max)}, ca. ${item.durationMin} minutter`}>
              <View style={styles.left}>
                <Text style={styles.name}>{item.serviceName}</Text>
                <Text style={styles.muted}>
                  Ca. {item.durationMin} min.{item.note ? ` · ${item.note}` : ""}
                </Text>
              </View>
              <Text style={styles.price}>{formatPriceRange(item.price.min, item.price.max)}</Text>
            </View>
          ))}
        </View>
      ))}
      <Text style={styles.muted}>
        Priser {PRICE_SOURCE}. {PRICE_FINAL_NOTE}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  group: { gap: spacing.xs },
  groupName: { fontSize: fontSize.md, fontWeight: "700", color: colors.brand800 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line, borderRadius: radius.sm },
  left: { flex: 1 },
  name: { fontSize: fontSize.md, color: colors.ink },
  price: { fontSize: fontSize.md, fontWeight: "700", color: colors.ink, textAlign: "right" },
  muted: { fontSize: fontSize.sm, color: colors.inkMuted },
});
