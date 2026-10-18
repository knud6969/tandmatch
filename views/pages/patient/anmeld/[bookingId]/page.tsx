import type { Metadata } from "next";
import { ReviewFormPage } from "@/views/components/patient/review-form";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";

export const metadata: Metadata = { title: "Skriv anmeldelse" };

export default async function PatientReviewFormPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  return (
    <Container>
      <PageIntro title="Skriv anmeldelse">
        <p>Din anmeldelse hjælper andre patienter. Kun besøg, der er gennemført via TandMatch, kan anmeldes.</p>
      </PageIntro>
      <ReviewFormPage bookingId={bookingId} />
    </Container>
  );
}
