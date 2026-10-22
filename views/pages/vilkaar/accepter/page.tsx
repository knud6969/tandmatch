import type { Metadata } from "next";
import Link from "next/link";
import { TermsAcceptForm } from "@/views/components/auth/terms-accept-form";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/constants/legal";
import { safeInternalPath } from "@/lib/common/navigation/paths";

export const metadata: Metadata = { title: "Accepter vilkår" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Vilkårs-gaten (architecture 2.5). Ingen samtykke-afkrydsninger her; de bruges kun i konteksten.
export default async function AcceptTermsPage({ searchParams }: { searchParams: SearchParams }) {
  const { naeste } = await searchParams;
  return (
    <Container>
      <PageIntro title="Velkommen til TandMatch">
        <p>
          Før du bruger TandMatch, skal du acceptere brugervilkårene og have læst privatlivspolitikken.
        </p>
      </PageIntro>

      <Card className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p>
            <Badge tone="warning">Pladsholdertekst</Badge>
          </p>
          <p className="text-base leading-relaxed text-ink-muted">
            De juridiske tekster er endnu ikke skrevet og gennemgået. Teksterne på siderne er pladsholdere.
          </p>
        </div>

        <ul className="flex flex-col gap-2 text-base">
          <li>
            <Link href="/vilkaar" className="font-semibold text-brand-700 underline underline-offset-4">
              Læs brugervilkårene
            </Link>
          </li>
          <li>
            <Link href="/privatliv" className="font-semibold text-brand-700 underline underline-offset-4">
              Læs privatlivspolitikken
            </Link>
          </li>
        </ul>

        <p className="text-base leading-relaxed text-ink-muted">
          Accepten er en aftale om brug af tjenesten. Den er <strong className="font-semibold text-ink">ikke</strong>{" "}
          et samtykke til behandling af helbredsoplysninger. Du bliver bedt om et særskilt samtykke, når det er
          relevant, fx før du uploader billeder eller starter en samtale med AI-assistenten.
        </p>

        <TermsAcceptForm naeste={safeInternalPath(naeste)} />

        <p className="text-sm text-ink-muted">
          Version: vilkår {TERMS_VERSION}, privatliv {PRIVACY_VERSION}
        </p>
      </Card>
    </Container>
  );
}
