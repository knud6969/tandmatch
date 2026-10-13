import type { Metadata } from "next";
import { DentistsEditor } from "@/views/components/clinic/dentists-editor";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";

export const metadata: Metadata = { title: "Tandlæger og portefølje" };

export default function ClinicPage() {
  return (
    <Container>
      <PageIntro title="Tandlæger og portefølje">
        <p>Tilføj klinikkens tandlæger med portræt og billeder af resultater.</p>
      </PageIntro>
      <DentistsEditor />
    </Container>
  );
}
