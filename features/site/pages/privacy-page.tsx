import type { Metadata } from "next";
import { LegalPage } from "@/features/site/components/legal-page";
import { PrivacySections } from "@/features/site/components/privacy-sections";
import { PRIVACY_VERSION } from "@/lib/identity/constants/legal";

export const metadata: Metadata = { title: "Privatlivspolitik" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privatlivspolitik"
      intro="Hvilke oplysninger vi behandler om dig, hvorfor, og hvilke rettigheder du har."
      updated="25. oktober 2026"
      version={PRIVACY_VERSION}
    >
      <PrivacySections />
    </LegalPage>
  );
}
