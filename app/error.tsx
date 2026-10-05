"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Container>
      <PageIntro title="Noget gik galt" />
      <Alert tone="danger" role="alert">
        <p>Siden kunne ikke vises. Prøv igen om lidt.</p>
      </Alert>
      <Button onClick={() => reset()} className="sm:self-start" fullWidth>
        Prøv igen
      </Button>
    </Container>
  );
}
