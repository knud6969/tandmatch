import { BASIC_CLINIC_LABEL, VERIFIED_CLINIC_LABEL } from "@/lib/clinics/constants/clinic-texts";
import { Badge } from "@/components/ui/badge";

// Niveaumærkat (architecture 6.6): verificeret klinik (fuldt niveau) eller klinik, der endnu ikke er på TandMatch (basis).
export function TierBadge({ tier }: { tier: "basic" | "full" }) {
  return tier === "full" ? <Badge tone="brand">{VERIFIED_CLINIC_LABEL}</Badge> : <Badge>{BASIC_CLINIC_LABEL}</Badge>;
}
