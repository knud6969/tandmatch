import { Alert } from "@/components/ui/alert";

// Kort tekst på kalender og anmeldelser, så længe klinikken ikke er verificeret (architecture 6.3). Ikke en fejl.
// Kaldet sender hele første sætning, så grammatikken ligger hos kalderen.
export function NotVerifiedNote({ sentence }: { sentence: string }) {
  return (
    <Alert tone="info" title="Afventer verificering">
      <p data-testid="ikke-verificeret">
        {sentence} Du kan sætte profil, prisliste, åbningstider og tandlæger op imens.
      </p>
    </Alert>
  );
}
