import type { Metadata } from "next";
import { EligibleVisits } from "@/components/patient/eligible-visits";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Anmeldelser" };

// Besøg, patienten kan anmelde (architecture 6.2, 10.9).
export default function PatientReviewsPage() {
  return (
    <>
      <PageIntro title="Anmeldelser">
        <p>Anmeld dine verificerede besøg, så andre patienter kan finde en tandlæge med gode erfaringer.</p>
      </PageIntro>
      <EligibleVisits />
    </>
  );
}
