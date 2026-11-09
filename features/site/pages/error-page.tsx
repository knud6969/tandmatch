"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { PAGE_ERROR_TEXT } from "@/lib/common/constants/error-texts";
import { PageIntro } from "@/components/ui/page-intro";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Container>
      <PageIntro title="Noget gik galt" />
      <Alert tone="danger">{PAGE_ERROR_TEXT}</Alert>
      <Button onClick={() => reset()} className="sm:self-start" fullWidth>
        Prøv igen
      </Button>
    </Container>
  );
}
