import type { Metadata } from "next";
import { ClinicReviews } from "@/features/booking/components/clinic-reviews";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";

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
