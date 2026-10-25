import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";
import { InfoSection, PrototypeNote } from "@/features/site/components/info-section";

export const metadata: Metadata = { title: "Kontakt" };

const link = "text-brand-700 underline underline-offset-4";

export default function ContactPage() {
  return (
    <Container>
      <PageIntro title="Kontakt">
        <p>Skriv til os, hvis du har spørgsmål om TandMatch, din konto eller dine data.</p>
      </PageIntro>
      <PrototypeNote>
        <p>
          Oplysningerne er eksempler i et studieprojekt. Adressen er et testdomæne og bliver ikke læst. Skriv aldrig
          helbredsoplysninger i en e-mail.
        </p>
      </PrototypeNote>
      <InfoSection title="Generelle spørgsmål">
        <p>
          <a href="mailto:kontakt@tandmatch.dk" className={link}>kontakt@tandmatch.dk</a>
        </p>
        <p>Vi svarer normalt inden for to hverdage.</p>
      </InfoSection>
      <InfoSection title="Dine data og rettigheder">
        <p>
          Vil du have indsigt, rettelse eller sletning, kan du skrive til{" "}
          <a href="mailto:privatliv@tandmatch.dk" className={link}>privatliv@tandmatch.dk</a>. Det meste kan du også
          gøre selv under din konto. Se <a href="/privatliv" className={link}>privatlivspolitikken</a>.
        </p>
      </InfoSection>
      <InfoSection title="Er du klinik">
        <p>
          Spørgsmål om profil, verificering eller henvendelser kan sendes til{" "}
          <a href="mailto:klinik@tandmatch.dk" className={link}>klinik@tandmatch.dk</a>. Læs mere under{" "}
          <a href="/for-klinikker" className={link}>For klinikker</a>.
        </p>
      </InfoSection>
      <InfoSection title="Adresse">
        <p>TandMatch ApS (under stiftelse), c/o Copenhagen Business School, Solbjerg Plads 3, 2000 Frederiksberg</p>
      </InfoSection>
      <InfoSection title="Akut hjælp">
        <p>
          Har du stærke smerter, hævelse i ansigt eller hals, vejrtrækningsproblemer eller kan du ikke få stoppet en
          blødning, skal du ikke vente på os. Kontakt lægevagten eller ring 112 ved livstruende symptomer.
        </p>
      </InfoSection>
    </Container>
  );
}
