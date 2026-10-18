import { Alert } from "@/views/components/ui/alert";

// Kort tekst på kalender og anmeldelser, så længe klinikken ikke er verificeret (architecture 6.3). Ikke en fejl.
export function NotVerifiedNote({ what }: { what: "kalender" | "anmeldelser" }) {
  return (
    <Alert tone="info" title="Afventer verificering">
      <p data-testid="ikke-verificeret">
        Din {what === "kalender" ? "kalender" : "anmeldelser"} bliver tilgængelig, når TandMatch har verificeret klinikken. Du kan sætte profil, prisliste,
        åbningstider og tandlæger op imens.
      </p>
    </Alert>
  );
}
