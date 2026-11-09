import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";
import { InfoSection, PrototypeNote } from "@/features/site/components/info-section";

export const metadata: Metadata = { title: "Sådan tjener vi penge" };

export default function BusinessModelPage() {
  return (
    <Container>
      <PageIntro title="Sådan tjener vi penge">
        <p>
          Du skal vide, hvem der betaler for TandMatch, og hvorfor det ikke påvirker, hvilke klinikker du ser.
        </p>
      </PageIntro>
      <PrototypeNote>
        <p>
          TandMatch er et studieprojekt. Modellen herunder er den, vi vil bygge på, og tallene er eksempler. Der
          betaler ingen noget i dag.
        </p>
      </PrototypeNote>
      <InfoSection title="Kort fortalt">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Det er gratis for patienter, hver gang.</li>
          <li>Klinikker betaler kun, når en patient har booket en tid hos dem.</li>
          <li>Betaling påvirker aldrig rækkefølgen, anmeldelserne eller AI’ens forslag.</li>
        </ul>
      </InfoSection>
      <InfoSection title="Gratis for patienter">
        <p>
          Du kan beskrive dit problem, uploade billeder, sammenligne klinikker, kontakte op til 3 klinikker og
          booke uden at betale os noget. Vi sælger ikke dine oplysninger og viser ingen reklamer.
        </p>
      </InfoSection>
      <InfoSection title="Sådan betaler klinikkerne">
        <p>
          Det er gratis at oprette en klinik, udfylde profilen og blive verificeret. Der er intet abonnement og
          intet oprettelsesgebyr. Klinikken betaler et fast beløb for hver booket tid, der kommer fra en
          henvendelse via TandMatch.
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Eksempel: 149 kr. ekskl. moms pr. booket tid.</li>
          <li>Afviste henvendelser, ubesvarede henvendelser og henvendelser uden booking koster ikke noget.</li>
          <li>Klinikken betaler det samme, uanset hvad behandlingen koster. Vi tager ikke en procentdel af din regning.</li>
          <li>Du betaler klinikken direkte, efter besøget, til den pris klinikken aftaler med dig.</li>
        </ul>
      </InfoSection>
      <InfoSection title="Hvorfor det ikke påvirker, hvad du ser">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Der findes ingen betalte placeringer, og klinikker kan ikke købe sig højere op på listen.</li>
          <li>
            Rækkefølgen bestemmes af faste kriterier: pris fra klinikkens egen prisliste, anmeldelser,
            prisnøjagtighed, afstand og første ledige tid. Du kan selv ændre dem.
          </li>
          <li>AI’en kender ikke klinikkernes betaling, nævner aldrig priser og anbefaler ikke en bestemt klinik.</li>
          <li>Anmeldelser kan kun skrives efter en gennemført booking, og klinikken kan ikke fjerne dem.</li>
          <li>Priser vises med kilde, fx “ifølge klinikkens prisliste”. Trustpilot vises adskilt, med kilde og link.</li>
        </ul>
      </InfoSection>
      <InfoSection title="Hvad klinikken ser af dig">
        <p>
          Klinikken ser dit navn og dine kontaktoplysninger først, når den har accepteret din henvendelse, og du
          har booket en tid. Al kontakt før da går gennem TandMatch.
        </p>
      </InfoSection>
    </Container>
  );
}
