import type { Metadata } from "next";
import { ReviewForm } from "@/views/components/patient/review-form";
import { PageIntro } from "@/views/components/ui/page-intro";

export const metadata: Metadata = { title: "Anmeld besøg" };

// Anmeldelsesformular for ét verificeret besøg (architecture 6.2, 10.9).
export default async function PatientReviewPage({ params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = await params;
  return (
    <>
      <PageIntro title="Anmeld dit besøg">
        <p>Din anmeldelse er personlig og modereres, før den offentliggøres. Skriv kun om dine egne oplevelser.</p>
      </PageIntro>
      <ReviewForm visitId={visitId} />
    </>
  );
}
