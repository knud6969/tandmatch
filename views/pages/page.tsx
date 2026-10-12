import type { Metadata } from "next";
import { AiDisclaimer } from "@/views/components/ui/disclaimer";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";
import { HomeFlash } from "@/views/components/session/home-flash";

export const metadata: Metadata = { title: "Forside" };

// Midlertidig forside (omlægning, opgave 0.9). Erstattes af den rigtige forside i trin 3.
export default function HomePage() {
  return (
    <Container size="wide" className="sm:gap-10">
      <HomeFlash />
      <PageIntro title="TandMatch">
        <p>
          Vi bygger om til en ny model, hvor du beskriver dit tandproblem og sammenligner klinikker. Siden er
          under opbygning.
        </p>
      </PageIntro>
      <AiDisclaimer />
    </Container>
  );
}
