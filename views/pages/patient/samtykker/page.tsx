import type { Metadata } from "next";
import Link from "next/link";
import { DataExportButton } from "@/views/components/patient/data-export-button";
import { ConsentsList } from "@/views/components/patient/consents-list";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";

export const metadata: Metadata = { title: "Mine samtykker" };

export default function PatientConsentsPage() {
  return (
    <Container>
      <PageIntro title="Mine samtykker">
        <p>
          Du bestemmer selv, hvad dine oplysninger bruges til. Du kan til enhver tid trække et samtykke tilbage.{" "}
          <Link href="/patient/konto" className="font-semibold text-brand-700">
            Tilbage til kontoen
          </Link>
        </p>
      </PageIntro>
      <div className="flex flex-col gap-6">
        <ConsentsList />
        <DataExportButton />
      </div>
    </Container>
  );
}
