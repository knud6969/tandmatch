import type { ReactNode } from "react";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";
import { InfoSection, PrototypeNote } from "@/features/site/components/info-section";

// Fælles ramme for de juridiske tekster: titel, ingress, studieprojekt-note, afsnit og "Senest opdateret".
export function LegalPage({
  title,
  intro,
  updated,
  version,
  children,
}: {
  title: string;
  intro: string;
  updated: string;
  version: string;
  children: ReactNode;
}) {
  return (
    <Container>
      <PageIntro title={title}>
        <p>{intro}</p>
      </PageIntro>
      <PrototypeNote>
        <p>
          TandMatch er et studieprojekt på CBS. Teksten er skrevet til prototypen og er ikke gennemgået af en
          jurist. Virksomhedsoplysningerne er pladsholdere.
        </p>
      </PrototypeNote>
      {children}
      <p className="text-sm text-ink-muted">
        Senest opdateret: {updated}. Version: {version}
      </p>
    </Container>
  );
}

export { InfoSection };
