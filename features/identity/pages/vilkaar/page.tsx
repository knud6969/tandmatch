import type { Metadata } from "next";
import { LegalPage } from "@/features/site/ui";
import { TermsSections } from "@/features/identity/components/terms-sections";
import { TERMS_VERSION } from "@/lib/identity/constants/legal";

export const metadata: Metadata = { title: "Brugervilkår" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Brugervilkår"
      intro="Reglerne for at bruge TandMatch som patient og som klinik."
      updated="25. oktober 2026"
      version={TERMS_VERSION}
    >
      <TermsSections />
    </LegalPage>
  );
}
