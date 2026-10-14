import type { Metadata } from "next";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";
import { InfoSection, PrototypeNote } from "@/views/components/home/info-section";

export const metadata: Metadata = { title: "Sådan tjener vi penge" };

export default function BusinessModelPage() {
  return (
    <Container>
      <PageIntro title="Sådan tjener vi penge">
        <p>Vi vil være åbne om, hvordan TandMatch finansieres.</p>
      </PageIntro>
      <PrototypeNote>
        <p>TandMatch er en prototype. Detaljerne herunder er ikke besluttet, og der betales ikke noget i dag.</p>
      </PrototypeNote>
      <InfoSection title="Gratis for patienter">
        <p>Det koster ikke noget at beskrive dit problem, sammenligne klinikker eller kontakte dem.</p>
      </InfoSection>
      <InfoSection title="Klinikkerne betaler for leads">
        <p>
          Tanken er, at klinikker betaler for de henvendelser (leads), de modtager fra patienter. Model og
          priser er ikke fastlagt.
        </p>
      </InfoSection>
      <InfoSection title="Gennemsigtighed for dig">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Priser vises med kilde, fx “ifølge klinikkens prisliste”.</li>
          <li>Rangeringen vises med de kriterier, den bygger på, og du kan ændre dem.</li>
          <li>Anmeldelser er markeret som verificerede, når de bygger på en gennemført booking.</li>
          <li>AI’en anbefaler ikke en bestemt klinik og fastsætter ikke priser.</li>
        </ul>
      </InfoSection>
    </Container>
  );
}
