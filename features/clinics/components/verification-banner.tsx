import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import type { ClinicStatus } from "@/lib/clinics/types/clinics";

const SHOW_VERIFICATION_BANNER = false;

// Forklarer kort, hvad der sker, og hvornår en ny klinik kan modtage henvendelser (architecture 6.3). Vises kun ved status
// "registered": for en verificeret klinik viser statusbadgen i oversigten allerede, hvordan det står til.
export function VerificationBanner({ status }: { status: ClinicStatus }) {
  // [PROTOTYPE] Klinikker auto-verificeres ved oprettelse (docs/beslutninger.md), så banneret vises ikke. Koden for
  // "registered" står, så det virker igen, når verificering slås til (SHOW_VERIFICATION_BANNER).
  if (!SHOW_VERIFICATION_BANNER || status !== "registered") return null;
  return (
    <Alert tone="warning" title="Afventer verificering">
      TandMatch tjekker klinikkens CVR og kontaktoplysninger, normalt inden for et par hverdage. Sæt profil og prisliste
      op imens. Når klinikken er verificeret, bliver den synlig for patienter og kan modtage henvendelser. Spørgsmål?{" "}
      <Link href="/kontakt" className="font-semibold underline underline-offset-4">
        Kontakt os
      </Link>
      .
    </Alert>
  );
}
