import type { Metadata } from "next";
import { ClinicReviews } from "@/views/components/clinic/clinic-reviews";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";

export const metadata: Metadata = { title: "Anmeldelser" };

export default function ClinicReviewsPage() {
  return (
    <Container>
      <PageIntro title="Anmeldelser">
        <p>Godkendte anmeldelser fra patienter med et gennemført besøg. Du kan svare offentligt én gang pr. anmeldelse.</p>
      </PageIntro>
      <ClinicReviews />
    </Container>
  );
}
