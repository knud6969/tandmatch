import type { Metadata } from "next";
import { LoginForm } from "@/features/identity/components/login-form";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";
import { safeInternalPath } from "@/lib/common/navigation/paths";

export const metadata: Metadata = { title: "Log ind" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Faste kvitteringer efter et link fra en e-mail (features/site 6.1). Kun kendte nøgler; teksten kommer aldrig fra URL'en.
const NOTICES: Record<string, string> = {
  "adgangskode-nulstillet": "Din adgangskode er skiftet. Log ind med den nye.",
  "email-bekraeftet":
    "Tak, linket er bekræftet. Når du har bekræftet fra både den gamle og den nye adresse, logger du ind med den nye e-mail.",
};

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { naeste, besked } = await searchParams;
  const notice = typeof besked === "string" ? NOTICES[besked] : undefined;
  return (
    <Container>
      <PageIntro title="Log ind som klinik">
        <p>Er du patient? Brug TandMatch-appen.</p>
      </PageIntro>
      <Card className="flex flex-col gap-5">
        {notice && <Alert tone="success">{notice}</Alert>}
        <LoginForm naeste={safeInternalPath(naeste)} />
      </Card>
    </Container>
  );
}
