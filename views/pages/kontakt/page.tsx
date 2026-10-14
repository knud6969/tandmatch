import type { Metadata } from "next";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";
import { InfoSection, PrototypeNote } from "@/views/components/home/info-section";

export const metadata: Metadata = { title: "Kontakt" };

export default function ContactPage() {
  return (
    <Container>
      <PageIntro title="Kontakt">
        <p>Har du spørgsmål om prototypen, er du velkommen til at skrive til os.</p>
      </PageIntro>
      <InfoSection title="E-mail">
        <p>
          <a href="mailto:kontakt@tandmatch.example" className="text-brand-700 underline underline-offset-4">
            kontakt@tandmatch.example
          </a>
        </p>
      </InfoSection>
      <PrototypeNote>
        <p>Adressen er en pladsholder på et testdomæne og bliver ikke læst. Skriv ikke helbredsoplysninger.</p>
      </PrototypeNote>
      <InfoSection title="Akut hjælp">
        <p>Ved akut sygdom eller livstruende symptomer: ring 112.</p>
      </InfoSection>
    </Container>
  );
}
