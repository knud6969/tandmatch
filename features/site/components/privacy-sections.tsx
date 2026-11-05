import { InfoSection } from "@/features/site/components/info-section";
import { CONSENT_TEXTS } from "@/lib/identity/constants/consents";

const mail = "text-brand-700 underline underline-offset-4";

// Privatlivspolitikkens afsnit. Bruges på /privatliv og i vilkårs-dialogen, så teksten kun findes ét sted.
export function PrivacySections() {
  return (
    <>
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
            <strong>Billeder i beskeder:</strong> du og klinikken kan sende billeder i tråden om din henvendelse. Dine
            egne billeder kræver dit samtykke til billeder. Klinikkens billeder sendes på klinikkens eget ansvar og
            grundlag; TandMatch indhenter ikke noget samtykke på klinikkens vegne. Klinikken ser ikke tråden, hvis den
            har afvist din henvendelse.
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
            <strong>Gemte klinikker (favoritter):</strong> hvilke klinikker du har gemt, knyttet til din konto. Vises
            aldrig for klinikkerne. Grundlag: aftale.
          </li>
          <li>
            <strong>Klinikker:</strong> login, CVR, klinikkens oplysninger og tandlægers navn, titel og billede.
            Grundlag: aftale.
          </li>
          <li>
            <strong>Klinikker, der ikke har oprettet sig:</strong> navn, adresse, CVR, kontaktoplysninger og
            åbningstider er hentet fra offentlige erhvervsregistre (CVR) og vises i oversigten. Grundlag: berettiget
            interesse. Oplysningerne kan indeholde en tandlæges navn. Du kan bede os fjerne dem ved at skrive til{" "}
            <a className={mail} href="mailto:privatliv@tandmatch.dk">privatliv@tandmatch.dk</a>; vi gør det efter
            anmodning.
          </li>
          <li>
            <strong>Teknisk drift:</strong> et SHA-256-hash af IP-adressen (ikke selve adressen) til beskyttelse mod
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
          <li>
            Billeder i beskedtråde med en klinik (både dine og klinikkens) slettes automatisk 12 måneder efter den seneste
            aktivitet i tråden. Trækker du dit samtykke til billeder tilbage, slettes dine egne billeder med det samme.
            Klinikkens billeder af dig følger fristen, din kontosletning eller en anmodning til os. Beskedteksten bliver
            stående.
          </li>
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
          <li>Leverandør af hosting af serverne og leverandør af e-mail (nulstilling af adgangskode). Leverandørerne er ikke valgt endnu, og aftaler indgås, før rigtige oplysninger behandles.</li>
          <li>Resend, som sender e-mails om notifikationer, Expo og Apple (Apple Push Notification service), som leverer korte beskeder til patienternes app, og browserens push-tjeneste (Google, Mozilla, Apple eller Microsoft) for klinikker, der slår notifikationer til i browseren. De modtager kun de korte, generiske beskeder beskrevet under Notifikationer. Vi har endnu ikke databehandleraftaler med dem.</li>
          <li>
            OpenStreetMap Nominatim, som slår en klinikkens adresse (vej, postnummer og by) op, når klinikken oprettes
            eller ændrer adresse. Der sendes aldrig oplysninger om patienter. Og OpenFreeMap, som leverer kortet: når du
            ser kortet på websiden, henter din browser kortfliser direkte fra OpenFreeMap, som dermed modtager din
            IP-adresse og det kortudsnit, du ser. Det er offentlige tjenester, vi ikke har en databehandleraftale med.
          </li>
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
      <InfoSection title="10. Notifikationer">
        <p>
          Klinikker får e-mails om nye henvendelser, beskeder og bookinger. E-mailen sendes via Resend og indeholder
          ingen oplysninger om patienten, kun et link til TandMatch. Klinikker, der slår notifikationer til i
          browseren, får en kort, krypteret besked via browserens push-tjeneste (Google, Mozilla, Apple eller
          Microsoft, afhængigt af browseren); den indeholder ingen oplysninger om patienten, kun en generisk tekst og
          et link til TandMatch. Vi gemmer en adresse og to nøgler til push pr. browser, og de slettes, når klinikken
          logger ud, slår det fra eller sletter sin konto.
        </p>
        <p>
          Patienter, der slår notifikationer til i appen, får korte beskeder via Expo og Apple Push Notification
          service. Beskederne indeholder aldrig oplysninger om dit helbred. Vi gemmer en adresse til push (et token) pr.
          telefon, og den slettes, når du logger ud eller sletter din konto. Du kan slå notifikationer fra i appen
          eller i telefonens indstillinger.
        </p>
        <p>
          Hvis du har en konto, får du en kort e-mail og SMS, når en tid er booket eller aflyst, dagen før din tid og
          dagen efter, så du kan anmelde besøget. Beskederne indeholder kun et generisk indhold og evt. tidspunktet,
          aldrig oplysninger om dit helbred eller din behandling. E-mailen sendes til din login-adresse eller til den
          e-mailadresse, du selv har angivet under Konto i appen; SMS sendes kun, hvis du har angivet et telefonnummer
          dér. Adressen og nummeret gemmes kun til dette formål, vises aldrig for klinikker og slettes, når du
          sletter din konto. E-mails sendes via Resend; en SMS-leverandør tilføjes her, før SMS tages i brug. Derudover
          har du en notifikationsklokke i appen, som viser de samme hændelser uden at sende noget uden for TandMatch.
        </p>
      </InfoSection>
      <InfoSection title="11. Ændringer">
        <p>Ændrer vi politikken væsentligt, får du besked og skal læse den igen, før du fortsætter.</p>
      </InfoSection>
    </>
  );
}
