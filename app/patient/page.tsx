import type { Metadata } from "next";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Mine forespørgsler" };

export default function PatientHomePage() {
  return (
    <>
      <PageIntro title="Mine forespørgsler">
        <p>Her ser du dine forespørgsler og de svar, tandlæger sender dig.</p>
      </PageIntro>
      <Card>
        <p className="text-base leading-relaxed text-ink-muted">
          Du har ikke sendt nogen forespørgsler endnu. Når du har sendt en, vises den her, med status og svar.
        </p>
        <LinkButton href="/patient/forespoergsel/ny" className="mt-5 w-full sm:w-auto">
          Start ny forespørgsel
        </LinkButton>
      </Card>
    </>
  );
}
