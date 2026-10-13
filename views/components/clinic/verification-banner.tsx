import { Alert } from "@/views/components/ui/alert";
import type { ClinicStatus } from "@/lib/types/clinics";

// Viser klinikkens verificeringsstatus (architecture 6.3). En ny klinik kan sætte alt op, men modtager først leads,
// når TandMatch har verificeret den.
export function VerificationBanner({ status }: { status: ClinicStatus }) {
  if (status === "verified") {
    return (
      <Alert tone="success" title="Din klinik er verificeret">
        Patienterne ser din fulde profil, og du kan modtage forespørgsler.
      </Alert>
    );
  }
  return (
    <Alert tone="warning" title="Afventer verifikation">
      Du kan sætte profil, prisliste, åbningstider og tandlæger op nu. Indbakke og kalender er tomme, og patienter
      kan ikke sende dig forespørgsler, før TandMatch har verificeret klinikken.
    </Alert>
  );
}
