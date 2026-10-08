import { LinkButton } from "@/views/components/ui/button";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";

export default function NotFound() {
  return (
    <Container>
      <PageIntro title="Siden findes ikke">
        <p>Linket er muligvis forkert, eller siden er flyttet.</p>
      </PageIntro>
      <LinkButton href="/" fullWidth className="sm:w-auto sm:self-start">
        Til forsiden
      </LinkButton>
    </Container>
  );
}
