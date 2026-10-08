import type { Metadata } from "next";
import { DentistSearch } from "@/views/components/standard/dentist-search";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";

export const metadata: Metadata = { title: "Find tandlæge" };

// Standard-sporet (architecture 6.1). Offentlig: ingen login nødvendig.
export default function FindDentistPage() {
  return (
    <Container size="wide">
      <PageIntro title="Find tandlæge">
        <p>Se tandlæger i nærheden for almindelige og akutte ydelser. Listen viser afstand, næste ledige tid, prisinterval og anmeldelser.</p>
      </PageIntro>
      <DentistSearch />
    </Container>
  );
}
