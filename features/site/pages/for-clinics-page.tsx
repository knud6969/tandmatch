import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";
import { LinkButton } from "@/components/ui/button";
import { InfoSection, PrototypeNote } from "@/features/site/components/info-section";

export const metadata: Metadata = { title: "For klinikker" };

export default function ForClinicsPage() {
  return (
    <Container>
      <PageIntro title="For klinikker">
        <p>Få henvendelser fra patienter, der ved, hvad de vil have, og som allerede har set prisen.</p>
      </PageIntro>
      <InfoSection title="Det får I">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Én konto til hele klinikken, med profil, tandlæger, portefølje, prisliste og åbningstider.</li>
          <li>Henvendelser (leads) med en opsummering af patientens beskrivelse, de valgte behandlinger og eventuelle billeder, efter patientens samtykke.</li>
          <li>Ét kort pr. lead med knapperne Accepter, Accepter med kommentar og Afvis. Et lead kan klares på under et minut.</li>
          <li>Bookinger i jeres kalender og verificerede anmeldelser, som I kan svare på offentligt.</li>
          <li>Trustpilot-score og -link, som I selv angiver, vist adskilt fra anmeldelserne på TandMatch.</li>
        </ul>
      </InfoSection>
      <InfoSection title="Sådan kommer I i gang">
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          <li>Opret klinikken med CVR, adresse og kontaktoplysninger.</li>
          <li>Udfyld profilen én gang: priser på jeres ydelser, åbningstider, tandlæger og billeder.</li>
          <li>Bliv verificeret, så profilen bliver fuld og kan modtage henvendelser.</li>
          <li>Besvar henvendelser, og patienten booker en ledig tid.</li>
        </ol>
      </InfoSection>
      <InfoSection title="Hvad patienten ser">
        <p>
          Patienter sammenligner klinikker på jeres egen prisliste (vist som “ifølge klinikkens prisliste”),
          anmeldelser, prisnøjagtighed, afstand og første ledige tid. Hold prislisten opdateret: Patienter
          anmelder, om den endelige pris svarede til prisoverslaget.
        </p>
      </InfoSection>
      <InfoSection title="Fair spilleregler">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Rækkefølgen bestemmes af faste kriterier. Ingen kan købe en bedre placering.</li>
          <li>I ser patientens navn og kontaktoplysninger først, når I har accepteret, og der er booket en tid.</li>
          <li>Klinikker kan ikke se hinandens henvendelser, svar eller patienter.</li>
          <li>AI’en giver kun patienten en foreløbig vurdering. Klinikken laver den endelige vurdering.</li>
        </ul>
      </InfoSection>
      <InfoSection title="Pris">
        <p>
          Det er gratis at oprette sig. I betaler eksempelvis 149 kr. ekskl. moms for hver booket tid, ikke for
          afviste eller ubesvarede henvendelser. Se <a className="underline" href="/saadan-tjener-vi-penge">Sådan tjener vi penge</a>.
        </p>
      </InfoSection>
      <PrototypeNote>
        <p>TandMatch er et studieprojekt. Priser og betaling er endnu ikke i drift.</p>
      </PrototypeNote>
      <div>
        <LinkButton href="/opret/klinik">Opret klinik</LinkButton>
      </div>
    </Container>
  );
}
