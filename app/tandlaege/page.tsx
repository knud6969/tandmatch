import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Indbakke" };

export default function DentistInboxPage() {
  return (
    <>
      <PageIntro title="Indbakke">
        <p>Her samles forespørgsler, der matcher din profil.</p>
      </PageIntro>
      <Card>
        <p className="text-base leading-relaxed text-ink-muted">
          Der er ingen forespørgsler endnu. Indbakken bliver udfyldt, når din profil er verificeret, og en patient
          sender en forespørgsel, der matcher dig.
        </p>
      </Card>
    </>
  );
}
