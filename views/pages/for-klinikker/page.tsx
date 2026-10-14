import type { Metadata } from "next";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";
import { LinkButton } from "@/views/components/ui/button";
import { InfoSection, PrototypeNote } from "@/views/components/home/info-section";

export const metadata: Metadata = { title: "For klinikker" };

export default function ForClinicsPage() {
  return (
    <Container>
      <PageIntro title="For klinikker">
        <p>Mød patienter, der har beskrevet deres behov, og vis dem, hvad jeres klinik tilbyder.</p>
      </PageIntro>
      <InfoSection title="Det får I">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>En profil med tandlæger, portefølje, prisliste og åbningstider.</li>
          <li>Leads med en opsummering af patientens beskrivelse og eventuelle billeder (efter patientens samtykke).</li>
          <li>Ét kort pr. lead, hvor I kan acceptere, acceptere med kommentar eller afvise på under et minut.</li>
          <li>Bookinger og verificerede anmeldelser, som I kan svare på offentligt.</li>
        </ul>
      </InfoSection>
      <InfoSection title="Sådan kommer I i gang">
        <p>Opret klinikken, udfyld profilen, og bliv verificeret for at få fuld profil og modtage leads.</p>
      </InfoSection>
      <PrototypeNote>
        <p>Priser for klinikker er ikke besluttet. Se “Sådan tjener vi penge”.</p>
      </PrototypeNote>
      <div>
        <LinkButton href="/opret/klinik">Opret klinik</LinkButton>
      </div>
    </Container>
  );
}
