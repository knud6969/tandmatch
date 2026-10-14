import { Badge } from "@/views/components/ui/badge";

// Niveaumærkat (architecture 6.6): verificeret klinik (fuldt niveau) eller klinik, der endnu ikke er på TandMatch (basis).
export function TierBadge({ tier }: { tier: "basic" | "full" }) {
  return tier === "full" ? <Badge tone="brand">Verificeret klinik</Badge> : <Badge>Ikke på TandMatch endnu</Badge>;
}
