import type { Metadata } from "next";
import { LeadInbox } from "@/views/components/clinic/lead-inbox";
import { ClinicOverview } from "@/views/components/clinic/clinic-overview";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";

export const metadata: Metadata = { title: "Din klinik" };

export default function ClinicHomePage() {
  return (
    <Container>
      <PageIntro title="Din klinik">
        <p>Her svarer du på henvendelser fra patienter og ser, hvor langt opsætningen er.</p>
      </PageIntro>
      <section aria-labelledby="henvendelser" className="flex flex-col gap-4">
        <h2 id="henvendelser" className="text-xl font-semibold text-ink">
          Henvendelser
        </h2>
        <LeadInbox />
      </section>
      <ClinicOverview />
    </Container>
  );
}
