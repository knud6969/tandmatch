import { MAX_ACTIVE_LEADS_PER_CASE } from "@/lib/constants/limits";
import type { Metadata } from "next";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";
import { AiDisclaimer } from "@/views/components/ui/disclaimer";
import { InfoSection } from "@/views/components/home/info-section";

export const metadata: Metadata = { title: "Sådan virker det" };

export default function HowItWorksPage() {
  return (
    <Container>
      <PageIntro title="Sådan virker det">
        <p>Fra beskrivelse til booket tid, og hvad klinikken ser undervejs.</p>
      </PageIntro>
      <InfoSection title="For patienter">
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          <li>Beskriv dit problem med egne ord, eller upload et billede. Du kan chatte uden at logge ind.</li>
          <li>Bekræft, hvilke behandlinger det handler om. Du vælger selv.</li>
          <li>Sammenlign klinikker på pris, anmeldelser, afstand og ledig tid. Du kan ændre kriterierne.</li>
          <li>Send din beskrivelse til op til {MAX_ACTIVE_LEADS_PER_CASE} klinikker. Til det skal du oprette en bruger og give samtykke, især hvis du har uploadet billeder.</li>
          <li>Book en tid, og skriv en anmeldelse efter besøget.</li>
        </ol>
      </InfoSection>
      <InfoSection title="For klinikker">
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          <li>Opret klinikken og udfyld profil, tandlæger, prisliste og åbningstider.</li>
          <li>Få leads med en opsummering af patientens beskrivelse.</li>
          <li>Accepter, accepter med kommentar eller afvis, på under et minut.</li>
          <li>Patienten booker en ledig tid. Klinikken svarer på anmeldelser.</li>
        </ol>
      </InfoSection>
      <InfoSection title="Hvad AI’en gør">
        <p>
          AI’en hjælper dig med at beskrive og strukturere problemet og kan give en foreløbig vurdering. Den
          nævner ikke priser og anbefaler ikke en bestemt klinik. Klinikken laver altid den endelige vurdering.
        </p>
      </InfoSection>
      <AiDisclaimer />
    </Container>
  );
}
