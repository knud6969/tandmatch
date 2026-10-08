import type { Metadata } from "next";
import { DentistReviews } from "@/views/components/dentist/dentist-reviews";
import { PageIntro } from "@/views/components/ui/page-intro";

export const metadata: Metadata = { title: "Anmeldelser" };

// Godkendte anmeldelser af tandlægen, med mulighed for offentligt svar (architecture 6.3, 10.9).
export default function DentistReviewsPage() {
  return (
    <>
      <PageIntro title="Anmeldelser">
        <p>Verificerede anmeldelser af dig. Du kan svare offentligt, når svaret er godkendt af moderation.</p>
      </PageIntro>
      <DentistReviews />
    </>
  );
}
