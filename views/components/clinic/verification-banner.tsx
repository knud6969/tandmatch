import { Alert } from "@/views/components/ui/alert";
import type { ClinicStatus } from "@/lib/types/clinics";

// Forklarer, at en ny klinik først modtager henvendelser, når TandMatch har verificeret den (architecture 6.3). Vises kun ved
// status "registered": for en verificeret klinik viser statusbadgen i oversigten allerede, hvordan det står til.
export function VerificationBanner({ status }: { status: ClinicStatus }) {
  if (status !== "registered") return null;
  return (
    <Alert tone="warning" title="Afventer verificering">
      Du kan sætte profil, prisliste, åbningstider og tandlæger op nu. Indbakke og kalender er tomme, og patienter
      kan ikke sende dig henvendelser, før TandMatch har verificeret klinikken.
    </Alert>
  );
}
