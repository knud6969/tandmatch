import type { Metadata } from "next";
import { Badge } from "@/views/components/ui/badge";
import { Card } from "@/views/components/ui/card";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";
import { TERMS_VERSION } from "@/lib/constants/legal";

export const metadata: Metadata = { title: "Brugervilkår" };

// Pladsholder. Den juridisk gennemgåede tekst skrives senere (architecture 12.4).
export default function TermsPage() {
  return (
    <Container>
      <PageIntro title="Brugervilkår">
        <p>
          <Badge tone="warning">Pladsholder</Badge>
        </p>
      </PageIntro>
      <Card className="flex flex-col gap-4 text-base leading-relaxed text-ink">
        <p className="text-ink-muted">
          Denne side er en pladsholder. De endelige brugervilkår er ikke skrevet og juridisk gennemgået endnu.
        </p>
        <h2 className="pt-2 text-lg font-semibold">Om tjenesten</h2>
        <p className="text-ink-muted">[Pladsholder: beskrivelse af TandMatch og hvad platformen kan og ikke kan.]</p>
        <h2 className="pt-2 text-lg font-semibold">Medicinsk rådgivning</h2>
        <p className="text-ink-muted">
          [Pladsholder: TandMatch giver ikke medicinsk rådgivning. Tandlægen vurderer altid din situation.]
        </p>
        <h2 className="pt-2 text-lg font-semibold">Ansvar og brug</h2>
        <p className="text-ink-muted">[Pladsholder: ansvar, brugerregler og opsigelse.]</p>
        <p className="pt-2 text-sm text-ink-muted">Version: {TERMS_VERSION}</p>
      </Card>
    </Container>
  );
}
