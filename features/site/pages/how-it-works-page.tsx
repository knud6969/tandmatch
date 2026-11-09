import { MAX_ACTIVE_LEADS_PER_CASE } from "@/lib/common/constants/limits";
import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";
import { AiDisclaimer } from "@/components/ui/disclaimer";
import { InfoSection } from "@/features/site/components/info-section";

export const metadata: Metadata = { title: "Sådan virker det" };

export default function HowItWorksPage() {
  return (
    <Container>
      <PageIntro title="Sådan virker det">
        <p>Fra beskrivelse til booket tid, og hvad klinikken ser undervejs.</p>
      </PageIntro>
      <InfoSection title="For patienter">
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          <li>Åbn appen og beskriv dit problem med egne ord, eller upload et billede af munden (kræver dit samtykke). Du kan chatte uden at logge ind.</li>
          <li>AI’en stiller uddybende spørgsmål og foreslår behandlinger, der kan passe. Du bekræfter selv, hvad der er rigtigt.</li>
          <li>Sammenlign klinikker på pris fra klinikkens prisliste, anmeldelser, prisnøjagtighed, afstand og første ledige tid. Rækkefølgen følger faste kriterier, som du kan ændre. Betaling påvirker den aldrig.</li>
          <li>Send din beskrivelse til op til {MAX_ACTIVE_LEADS_PER_CASE} klinikker. Til det skal du oprette en bruger og give samtykke, især hvis du har uploadet billeder.</li>
          <li>Klinikken accepterer eller afviser. Når den har accepteret, booker du en tid i klinikkens kalender. Klinikken ser først dit navn og dine kontaktoplysninger, når tiden er booket.</li>
          <li>Efter besøget kan du skrive en anmeldelse og fortælle, om den endelige pris svarede til prisoverslaget.</li>
        </ol>
      </InfoSection>
      <InfoSection title="For klinikker">
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          <li>Opret klinikken og udfyld profil, tandlæger, billeder, prisliste og åbningstider. Det gør I én gang.</li>
          <li>Få leads med en opsummering af patientens beskrivelse.</li>
          <li>Accepter, accepter med kommentar eller afvis, på under et minut.</li>
          <li>Patienten booker en ledig tid. Klinikken svarer på anmeldelser.</li>
        </ol>
      </InfoSection>
      <InfoSection title="Har du ondt?">
        <p>
          Er der tegn på noget akut, henviser vi dig straks til klinikker med en ledig akuttid. Ved livstruende
          symptomer skal du ringe 112.
        </p>
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
