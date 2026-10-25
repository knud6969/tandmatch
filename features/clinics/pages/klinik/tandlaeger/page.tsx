import type { Metadata } from "next";
import { DentistsEditor } from "@/features/clinics/components/dentists-editor";
import { ClinicSettingsNav } from "@/features/clinics/components/clinic-settings-nav";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Tandlæger og portefølje" };

export default function ClinicPage() {
  return (
    <Container>
      <ClinicSettingsNav />
      <PageIntro title="Tandlæger og portefølje">
        <p>Tandlæger med portræt og billeder af resultater.</p>
      </PageIntro>
      <DentistsEditor />
    </Container>
  );
}
