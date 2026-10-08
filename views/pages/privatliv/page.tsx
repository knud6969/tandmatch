import type { Metadata } from "next";
import { Badge } from "@/views/components/ui/badge";
import { Card } from "@/views/components/ui/card";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";
import { PRIVACY_VERSION } from "@/lib/constants/legal";

export const metadata: Metadata = { title: "Privatlivspolitik" };

// Pladsholder. Helbredsoplysninger er særlige kategorier (GDPR art. 9); den endelige tekst skal juridisk gennemgås.
export default function PrivacyPage() {
  return (
    <Container>
      <PageIntro title="Privatlivspolitik">
        <p>
          <Badge tone="warning">Pladsholder</Badge>
        </p>
      </PageIntro>
      <Card className="flex flex-col gap-4 text-base leading-relaxed text-ink">
        <p className="text-ink-muted">
          Denne side er en pladsholder. Privatlivspolitikken er ikke skrevet og juridisk gennemgået endnu.
        </p>
        <h2 className="pt-2 text-lg font-semibold">Hvilke oplysninger vi behandler</h2>
        <p className="text-ink-muted">
          [Pladsholder: kontooplysninger, og helbredsoplysninger som tekst og billeder, der kun behandles efter dit
          særskilte samtykke.]
        </p>
        <h2 className="pt-2 text-lg font-semibold">Dine rettigheder</h2>
        <p className="text-ink-muted">[Pladsholder: indsigt, berigtigelse, sletning og tilbagetrækning af samtykke.]</p>
        <h2 className="pt-2 text-lg font-semibold">Kontakt</h2>
        <p className="text-ink-muted">[Pladsholder: dataansvarlig og kontaktoplysninger.]</p>
        <p className="pt-2 text-sm text-ink-muted">Version: {PRIVACY_VERSION}</p>
      </Card>
    </Container>
  );
}
