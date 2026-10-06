import type { Metadata } from "next";
import { PatientRequestList } from "@/components/patient/request-list";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Mine forespørgsler" };

// Oversigt over patientens forespørgsler. Svar åbnes via /patient/forespoergsel/[id]/svar.
export default function PatientHomePage() {
  return (
    <>
      <PageIntro title="Mine forespørgsler">
        <p>Her ser du dine forespørgsler og de svar, tandlæger sender dig.</p>
      </PageIntro>
      <PatientRequestList />
    </>
  );
}
