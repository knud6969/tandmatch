import type { Metadata } from "next";
import { ConsentsList } from "@/components/patient/consents-list";
import { DataExportButton } from "@/components/patient/data-export-button";
import { Card } from "@/components/ui/card";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Samtykker og data" };

// Samtykkeoversigt og dataeksport (architecture 6.2, 10.3). GDPR art. 7 (tilbagetrækning) og art. 15/20 (eksport).
export default function PatientConsentsPage() {
  return (
    <>
      <PageIntro title="Samtykker og data">
        <p>Se dine samtykker, træk dem tilbage, eller download en kopi af dine data.</p>
      </PageIntro>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-ink">Dine data</h2>
        <p className="text-base leading-relaxed text-ink-muted">
          Download en fil med dine forespørgsler, svar, anmeldelser og samtykker.
        </p>
        <DataExportButton />
      </Card>

      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-ink">Samtykker</h2>
        <ConsentsList />
      </div>
    </>
  );
}
