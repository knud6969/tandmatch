import type { Metadata } from "next";
import Link from "next/link";
import { DataExportButton } from "@/views/components/patient/data-export-button";
import { DeletePatientAccount } from "@/views/components/patient/delete-patient-account";
import { ProfileForm } from "@/views/components/patient/profile-form";
import { Card } from "@/views/components/ui/card";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";

export const metadata: Metadata = { title: "Min konto" };

export default function PatientAccountPage() {
  return (
    <Container>
      <PageIntro title="Min konto">
        <p>Dine oplysninger, dine data og sletning af kontoen.</p>
      </PageIntro>
      <div className="flex flex-col gap-6">
        <ProfileForm />
        <Card className="flex flex-col gap-3 p-4 sm:p-6">
          <h2 className="text-xl font-semibold text-ink">Samtykker</h2>
          <p className="text-base text-ink-muted">Se, hvad du har givet samtykke til, og træk et samtykke tilbage.</p>
          <div>
            <Link href="/patient/samtykker" className="inline-flex min-h-11 items-center font-semibold text-brand-700">
              Se og administrer samtykker
            </Link>
          </div>
        </Card>
        <DataExportButton />
        <DeletePatientAccount />
      </div>
    </Container>
  );
}
