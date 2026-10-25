import type { Metadata } from "next";
import { InfoSection, LegalPage } from "@/features/site/ui";
import { TERMS_VERSION } from "@/lib/identity/constants/legal";

export const metadata: Metadata = { title: "Brugervilkår" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Brugervilkår"
      intro="Reglerne for at bruge TandMatch som patient og som klinik."
      updated="25. oktober 2026"
      version={TERMS_VERSION}
    >
      <InfoSection title="1. Om tjenesten">
        <p>
          TandMatch (TandMatch ApS under stiftelse, c/o Copenhagen Business School, Solbjerg Plads 3, 2000
          Frederiksberg) er en markedsplads, der hjælper patienter med at finde en tandklinik. Patienter bruger
          appen, og klinikker bruger weben. Vi er ikke en tandklinik og leverer ikke behandling.
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Patienten beskriver sit problem, sammenligner klinikker, kontakter op til 3 klinikker og booker.</li>
          <li>Aftalen om behandling og betaling indgås alene mellem patienten og klinikken.</li>
        </ul>
      </InfoSection>
      <InfoSection title="2. Ingen sundhedsfaglig rådgivning">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>AI’en i TandMatch giver kun en foreløbig vurdering og er ikke en diagnose eller behandlingsplan.</li>
          <li>Klinikken laver altid den endelige vurdering, og først ved undersøgelsen kan behandling og pris fastlægges.</li>
          <li>Har du stærke smerter, hævelse eller blødning, du ikke kan stoppe, skal du kontakte lægevagten eller ringe 112 ved livstruende symptomer.</li>
        </ul>
      </InfoSection>
      <InfoSection title="3. Priser og rækkefølge">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Priser kommer fra klinikkens egen prisliste og er et overslag. Den endelige pris aftales med klinikken.</li>
          <li>Rækkefølgen af klinikker bestemmes af faste kriterier, som du kan ændre. Betaling fra klinikker påvirker den ikke.</li>
          <li>AI’en nævner ikke priser og anbefaler ikke en bestemt klinik.</li>
        </ul>
      </InfoSection>
      <InfoSection title="4. Din konto">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Du kan chatte uden login, men skal have en konto, før noget sendes til en klinik.</li>
          <li>Oplysningerne skal være rigtige, og du må ikke dele dit login med andre.</li>
          <li>Du kan til enhver tid slette din konto. Se privatlivspolitikken for, hvad der sker med dine data.</li>
        </ul>
      </InfoSection>
      <InfoSection title="5. Regler for patienter">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Upload kun billeder af din egen mund og kun, hvis du har givet samtykke.</li>
          <li>Send kun henvendelser, du mener alvorligt, og mød op til aftalte tider eller aflys i god tid.</li>
          <li>Klinikken ser dit navn og dine kontaktoplysninger først, når den har accepteret, og en tid er booket.</li>
        </ul>
      </InfoSection>
      <InfoSection title="6. Regler for klinikker">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Klinikken har én konto og er ansvarlig for sin profil, sine priser, åbningstider og billeder.</li>
          <li>Priserne skal være korrekte og opdaterede. Klinikken må ikke tage væsentligt mere end prisoverslaget uden en saglig forklaring.</li>
          <li>Klinikken skal selv være lovligt registreret og må kun vise porteføljebilleder, hvor patienten skriftligt har givet samtykke, og hvor patienten ikke kan genkendes.</li>
          <li>Oplysninger om patienter må kun bruges til at besvare henvendelsen og gennemføre behandlingen, ikke til markedsføring.</li>
          <li>Klinikken betaler efter den model, der er beskrevet under “Sådan tjener vi penge”, når betaling er indført. Betaling giver aldrig bedre placering.</li>
        </ul>
      </InfoSection>
      <InfoSection title="7. Anmeldelser">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Kun patienter med en gennemført booking via TandMatch kan anmelde klinikken. Anmeldelsen markeres som verificeret.</li>
          <li>Skriv ærligt om din egen oplevelse. Ingen personoplysninger om andre og ingen injurierende udtalelser.</li>
          <li>Anmeldelser modereres og kan afvises eller fjernes, hvis de bryder reglerne. Klinikken kan svare offentligt, men ikke fjerne anmeldelsen.</li>
          <li>Trustpilot-score vises adskilt, med kilde og link, som klinikken selv angiver.</li>
        </ul>
      </InfoSection>
      <InfoSection title="8. Ansvar">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Vi stiller tjenesten til rådighed, som den er, og kan ikke love, at den altid er tilgængelig eller uden fejl.</li>
          <li>Vi er ikke ansvarlige for klinikkens rådgivning, behandling, priser eller aflysninger, eller for oplysninger, klinikken selv har indtastet.</li>
          <li>Vi hæfter ikke for indirekte tab. Det gælder ikke ved forsæt eller grov uagtsomhed eller i det omfang, loven ikke tillader det.</li>
        </ul>
      </InfoSection>
      <InfoSection title="9. Opsigelse og lukning">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Du kan opsige og slette din konto når som helst uden varsel.</li>
          <li>Vi kan lukke en konto, der groft eller gentagne gange bryder vilkårene, og kan ændre eller stoppe tjenesten.</li>
        </ul>
      </InfoSection>
      <InfoSection title="10. Ændringer">
        <p>
          Vi kan ændre vilkårene. Ved væsentlige ændringer får du besked og skal acceptere de nye vilkår, før du
          fortsætter.
        </p>
      </InfoSection>
      <InfoSection title="11. Lovvalg og tvister">
        <p>
          Dansk ret gælder. Tvister afgøres ved de danske domstole. Som forbruger kan du også klage til
          Center for Klageløsning eller bruge EU’s online klageportal.
        </p>
      </InfoSection>
      <InfoSection title="12. Kontakt">
        <p>
          <a className="text-brand-700 underline underline-offset-4" href="mailto:kontakt@tandmatch.dk">kontakt@tandmatch.dk</a>
        </p>
      </InfoSection>
    </LegalPage>
  );
}
