import type { Metadata } from "next";
import { OpeningHoursForm } from "@/features/clinics/components/opening-hours-form";
import { ClinicSettingsNav } from "@/features/clinics/components/clinic-settings-nav";
import { TimeBlocks } from "@/features/clinics/components/time-blocks";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Åbningstider" };

export default function OpeningHoursPage() {
  return (
    <Container>
      <ClinicSettingsNav />
      <PageIntro title="Åbningstider">
        <p>Ugeskemaet giver patienterne ledige tider.</p>
      </PageIntro>
      <OpeningHoursForm />
      <TimeBlocks />
    </Container>
  );
}
