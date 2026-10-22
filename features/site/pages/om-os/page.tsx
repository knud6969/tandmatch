import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";
import { InfoSection, PrototypeNote } from "@/features/site/components/info-section";

export const metadata: Metadata = { title: "Om os" };

export default function AboutPage() {
  return (
    <Container>
      <PageIntro title="Om os">
        <p>TandMatch er et gruppeprojekt på INNT på CBS.</p>
      </PageIntro>
      <InfoSection title="Idéen">
        <p>
          Det skal være nemt at finde en tandlæge, man har tillid til, til en pris, der er til at overskue.
          Patienten beskriver sit problem, sammenligner klinikker og booker. Klinikken står for vurderingen.
        </p>
      </InfoSection>
      <InfoSection title="Kilder">
        <p>
          Postnumre og koordinater: <a className="underline" href="https://www.geonames.org" rel="noopener noreferrer">GeoNames</a>{" "}
          (<a className="underline" href="https://creativecommons.org/licenses/by/4.0/" rel="noopener noreferrer">CC BY 4.0</a>).
        </p>
      </InfoSection>
      <PrototypeNote>
        <p>Siden er en prototype lavet i et studieprojekt. Der er ikke tale om en driftsklar tjeneste.</p>
      </PrototypeNote>
    </Container>
  );
}
