import type { Metadata } from "next";
import { EligibleVisits } from "@/views/components/patient/eligible-visits";
import { OwnReviews } from "@/views/components/patient/own-reviews";
import { PageIntro } from "@/views/components/ui/page-intro";

export const metadata: Metadata = { title: "Anmeldelser" };

// Besøg, patienten kan anmelde, og patientens egne anmeldelser med status (architecture 6.2, 10.9).
export default function PatientReviewsPage() {
  return (
    <>
      <PageIntro title="Anmeldelser">
        <p>Anmeld dine verificerede besøg, så andre patienter kan finde en tandlæge med gode erfaringer.</p>
      </PageIntro>
      <EligibleVisits />
      <section aria-labelledby="mine-anmeldelser" className="flex flex-col gap-4">
        <h2 id="mine-anmeldelser" className="text-xl font-semibold text-ink">
          Mine anmeldelser
        </h2>
        <OwnReviews />
      </section>
    </>
  );
}
