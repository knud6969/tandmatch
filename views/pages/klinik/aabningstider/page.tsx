import type { Metadata } from "next";
import { OpeningHoursForm } from "@/views/components/clinic/opening-hours-form";
import { TimeBlocks } from "@/views/components/clinic/time-blocks";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";

export const metadata: Metadata = { title: "Åbningstider" };

export default function OpeningHoursPage() {
  return (
    <Container>
      <PageIntro title="Åbningstider">
        <p>Ugeskemaet bruges til at vise patienterne ledige tider. Tilføj akutvinduer og bloker tider, når I har lukket.</p>
      </PageIntro>
      <OpeningHoursForm />
      <TimeBlocks />
    </Container>
  );
}
