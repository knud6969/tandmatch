import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";
import { InfoSection, PrototypeNote } from "@/features/site/components/info-section";

export const metadata: Metadata = { title: "Om os" };

export default function AboutPage() {
  return (
    <Container>
      <PageIntro title="Om os">
        <p>Vi vil gøre det let at finde en tandlæge, man har tillid til, til en pris, der er til at overskue.</p>
      </PageIntro>
      <PrototypeNote>
        <p>
          TandMatch er et studieprojekt på INNT på Copenhagen Business School (CBS). Det er ikke en eksisterende
          virksomhed, og vilkår og privatlivspolitik er ikke gennemgået juridisk.
        </p>
      </PrototypeNote>
      <InfoSection title="Hvorfor">
        <p>
          Mange udskyder tandlægen, fordi de ikke ved, hvad det koster, eller hvor de skal ringe hen. Klinikkerne
          bruger samtidig tid på henvendelser, hvor patienten endnu ikke ved, hvad vedkommende har brug for.
        </p>
      </InfoSection>
      <InfoSection title="Hvad vi gør">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Patienten beskriver sit problem, og en AI hjælper med at forstå det. Klinikken vurderer altid selv.</li>
          <li>Patienten sammenligner klinikker på pris fra klinikkens egen prisliste, anmeldelser og afstand.</li>
          <li>Klinikken får henvendelser fra patienter, der ved, hvad de vil have, og klarer dem på under et minut.</li>
          <li>Anmeldelser kommer kun fra patienter, der har haft en tid via platformen.</li>
        </ul>
      </InfoSection>
      <InfoSection title="Hvad vi ikke gør">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Vi giver ikke sundhedsfaglig rådgivning og stiller ingen diagnoser.</li>
          <li>Vi sætter ikke priserne og anbefaler ikke en bestemt klinik.</li>
          <li>Vi sælger ikke placeringer. Læs mere under <a className="underline" href="/saadan-tjener-vi-penge">Sådan tjener vi penge</a>.</li>
        </ul>
      </InfoSection>
      <InfoSection title="Hvem står bag">
        <p>
          TandMatch ApS (under stiftelse), c/o Copenhagen Business School, Solbjerg Plads 3, 2000 Frederiksberg.
          Navn og adresse er pladsholdere i forbindelse med studieprojektet. Der er intet CVR-nummer endnu.
        </p>
      </InfoSection>
      <InfoSection title="Kilder">
        <p>
          Postnumre og koordinater: <a className="underline" href="https://www.geonames.org" rel="noopener noreferrer">GeoNames</a>{" "}
          (<a className="underline" href="https://creativecommons.org/licenses/by/4.0/" rel="noopener noreferrer">CC BY 4.0</a>).
          Kort: © OpenStreetMap-bidragydere.
        </p>
      </InfoSection>
    </Container>
  );
}
