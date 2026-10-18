import type { Metadata } from "next";
import { Suspense } from "react";
import { EmergencyFlow } from "@/views/components/emergency/emergency-flow";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";

export const metadata: Metadata = {
  title: "Jeg har ondt",
  description: "Find en klinik med en ledig akuttid, og få tiden reserveret, mens klinikken svarer.",
};

export default function EmergencyPage() {
  return (
    <Container>
      <PageIntro title="Jeg har ondt">
        <p>Vælg en klinik med en ledig akuttid. Vi reserverer tiden til dig, mens klinikken svarer. Klinikken laver den endelige vurdering.</p>
      </PageIntro>
      <Suspense fallback={<p role="status" className="text-base text-ink-muted">Indlæser …</p>}>
        <EmergencyFlow />
      </Suspense>
    </Container>
  );
}
