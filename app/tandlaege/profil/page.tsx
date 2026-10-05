import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Profil" };

export default function DentistProfilePage() {
  return (
    <>
      <PageIntro title="Profil">
        <p>Din offentlige profil, klinik og priser.</p>
      </PageIntro>
      <Card>
        <p className="text-base leading-relaxed text-ink-muted">
          Redigering af profil, klinik og priser er ikke bygget endnu.
        </p>
      </Card>
    </>
  );
}
