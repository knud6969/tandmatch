import type { Metadata } from "next";
import { InfoSection, LegalPage } from "@/features/site/components/legal-page";
import { CONSENT_TEXTS } from "@/lib/identity/constants/consents";
import { PRIVACY_VERSION } from "@/lib/identity/constants/legal";

export const metadata: Metadata = { title: "Privatlivspolitik" };

const mail = "text-brand-700 underline underline-offset-4";

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privatlivspolitik"
      intro="Hvilke oplysninger vi behandler om dig, hvorfor, og hvilke rettigheder du har."
      updated="25. oktober 2026"
      version={PRIVACY_VERSION}
    >
      <InfoSection title="1. Dataansvarlig">
        <p>
          TandMatch ApS (under stiftelse), c/o Copenhagen Business School, Solbjerg Plads 3, 2000 Frederiksberg.
          Spørgsmål om dine data: <a className={mail} href="mailto:privatliv@tandmatch.dk">privatliv@tandmatch.dk</a>.
        </p>
        <p>
          Når en klinik modtager din henvendelse eller booker dig, er klinikken selv dataansvarlig for de
          oplysninger, den modtager og bruger til din behandling.
        </p>
      </InfoSection>
      <InfoSection title="2. Hvilke oplysninger, hvorfor og på hvilket grundlag">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            <strong>Konto (patient):</strong> e-mail, fornavn, postnummer og telefon. Bruges til login, din sag og
            booking. Grundlag: aftale.
          </li>
          <li>
            <strong>Chat med AI og din beskrivelse:</strong> dine beskeder, AI’ens svar og en opsummering. Det er
            helbredsoplysninger (art. 9). Grundlag: dit udtrykkelige samtykke. Chatten deles aldrig med klinikker.
          </li>
          <li>
            <strong>Billeder af munden:</strong> helbredsoplysninger (art. 9). Grundlag: dit udtrykkelige samtykke,
            som gemmes med tidspunkt og tekstversion.
          </li>
          <li>
            <strong>Henvendelser til klinikker:</strong> din godkendte beskrivelse, valgte behandlinger, ønsket
            tidsrum, postnummer og eventuelle billeder. Grundlag: dit udtrykkelige samtykke til deling med de
            klinikker, du selv vælger.
          </li>
          <li>
            <strong>Booking:</strong> når du booker, får klinikken også dit navn, telefonnummer og din e-mail.
            Grundlag: aftale.
          </li>
          <li>
            <strong>Anmeldelser:</strong> stjerner, tekst, prisnøjagtighed og eventuel faktisk pris. Vises uden dit
            navn. Grundlag: aftale.
          </li>
          <li>
            <strong>Klinikker:</strong> login, CVR, klinikkens oplysninger og tandlægers navn, titel og billede.
            Grundlag: aftale.
          </li>
          <li>
            <strong>Teknisk drift:</strong> en afkortet, krypteret identifikator af IP-adressen til beskyttelse mod
            misbrug (begrænsning af antal forsøg). Grundlag: berettiget interesse i sikker drift.
          </li>
        </ul>
        <p>Din position bruges kun på din enhed til at beregne afstand og gemmes ikke hos os.</p>
      </InfoSection>
      <InfoSection title="3. Dit samtykke">
        <p>Samtykkerne er frivillige, og du kan trække dem tilbage når som helst. Teksterne, du accepterer, er:</p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>{CONSENT_TEXTS.ai_processing}</li>
          <li>{CONSENT_TEXTS.image_upload}</li>
          <li>{CONSENT_TEXTS.health_data_sharing}</li>
        </ul>
        <p>
          Trækker du samtykket til billeder tilbage, slettes billederne. Trækker du samtykket til AI-behandling
          tilbage, lukkes samtalen. Tilbagetrækning påvirker ikke lovligheden af behandling før tilbagetrækningen.
        </p>
      </InfoSection>
      <InfoSection title="4. Sådan bruger vi AI">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Din tekst renses automatisk for e-mail, telefonnummer, CPR-nummer og adresser, før den sendes til AI-tjenesten. Det virker ikke altid, så undlad at skrive navne og adresser.</li>
          <li>AI-tjenesten får aldrig dit navn, din e-mail, dit telefonnummer, dit postnummer eller klinikkernes priser. Billeder sendes uden skjulte metadata.</li>
          <li>AI’en giver kun en foreløbig vurdering. Der træffes ingen automatiske afgørelser om dig, og klinikken laver den endelige vurdering.</li>
        </ul>
      </InfoSection>
      <InfoSection title="5. Hvor længe vi opbevarer oplysningerne">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Uden konto: chat, billeder og opsummering slettes automatisk 48 timer efter seneste aktivitet, eller når du selv sletter dem.</li>
          <li>Med konto: oplysningerne gemmes, til du sletter din sag eller konto. Sletter du kontoen, slettes også dine henvendelser, kommende bookinger og anmeldelser.</li>
          <li>Klinikker: ved sletning fjernes klinikkens filer og login. Kun navn og adresse bevares, så patienters historik stadig kan vises.</li>
          <li>Tekniske logfiler med misbrugsbeskyttelse gemmes kortvarigt.</li>
        </ul>
      </InfoSection>
      <InfoSection title="6. Hvem modtager oplysningerne">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>De klinikker, du selv vælger at kontakte, i det omfang beskrevet ovenfor.</li>
          <li>Supabase, som hoster database, login og filer i EU (databehandler).</li>
          <li>OpenAI, som leverer AI-tjenesten (databehandler). Oplysninger kan blive behandlet uden for EU/EØS; overførslen sker på grundlag af EU’s standardkontraktbestemmelser eller tilsvarende gyldigt grundlag. Oplysningerne bruges ikke til at træne modeller.</li>
          <li>Leverandør af hosting af serverne og leverandør af e-mail (nulstilling af adgangskode), begge databehandlere.</li>
        </ul>
        <p>Vi sælger ikke dine oplysninger og viser ingen reklamer.</p>
      </InfoSection>
      <InfoSection title="7. Dine rettigheder">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Indsigt i og kopi af dine oplysninger, herunder eksport af dine data.</li>
          <li>Berigtigelse af forkerte oplysninger.</li>
          <li>Sletning af dine oplysninger og din konto.</li>
          <li>Tilbagetrækning af samtykke.</li>
          <li>Begrænsning af behandling og indsigelse mod behandling på grundlag af berettiget interesse.</li>
          <li>Dataportabilitet for oplysninger, du selv har givet os.</li>
        </ul>
        <p>
          Du kan bruge rettighederne under din konto eller ved at skrive til{" "}
          <a className={mail} href="mailto:privatliv@tandmatch.dk">privatliv@tandmatch.dk</a>. Vi svarer senest
          inden for en måned.
        </p>
        <p>
          Du kan klage til Datatilsynet, Carl Jacobsens Vej 35, 2500 Valby,{" "}
          <a className={mail} href="https://www.datatilsynet.dk" rel="noopener noreferrer">datatilsynet.dk</a>.
        </p>
      </InfoSection>
      <InfoSection title="8. Sikkerhed">
        <p>
          Forbindelsen er krypteret. Billeder ligger i et privat lager og vises kun via kortvarige links. Databasen
          sikrer, at en klinik aldrig kan se andre klinikkers henvendelser eller patienter.
        </p>
      </InfoSection>
      <InfoSection title="9. Cookies og lokal lagring">
        <p>
          Vi bruger kun det nødvendige til login og sikkerhed (sessionscookies og lokal lagring i browser og app).
          Vi bruger ingen cookies til statistik eller markedsføring, så der vises intet cookiebanner.
        </p>
      </InfoSection>
      <InfoSection title="10. Ændringer">
        <p>Ændrer vi politikken væsentligt, får du besked og skal læse den igen, før du fortsætter.</p>
      </InfoSection>
    </LegalPage>
  );
}
