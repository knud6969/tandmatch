import type { Metadata } from "next";
import { ReviewsOverview } from "@/views/components/patient/reviews-overview";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";

export const metadata: Metadata = { title: "Mine anmeldelser" };

export default function PatientReviewsPage() {
  return (
    <Container>
      <PageIntro title="Mine anmeldelser">
        <p>Skriv en anmeldelse efter et gennemført besøg, og følg, om den er godkendt.</p>
      </PageIntro>
      <ReviewsOverview />
    </Container>
  );
}
