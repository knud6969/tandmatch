import type { Metadata } from "next";
import { OpeningHoursForm } from "@/features/clinics/components/opening-hours-form";
import { TimeBlocks } from "@/features/clinics/components/time-blocks";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Åbningstider" };

export default function OpeningHoursPage() {
  return (
    <Container>
      <PageIntro title="Åbningstider">
        <p>Ugeskemaet bruges til at vise patienterne ledige tider. Tilføj akutvinduer og bloker tider, når klinikken har lukket.</p>
      </PageIntro>
      <OpeningHoursForm />
      <TimeBlocks />
    </Container>
  );
}
