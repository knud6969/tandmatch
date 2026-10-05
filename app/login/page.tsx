import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";
import { safeInternalPath } from "@/lib/navigation/paths";

export const metadata: Metadata = { title: "Log ind" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { naeste } = await searchParams;
  return (
    <Container>
      <PageIntro title="Log ind">
        <p>Patienter og tandlæger logger ind samme sted.</p>
      </PageIntro>
      <Card>
        <LoginForm naeste={safeInternalPath(naeste)} />
      </Card>
    </Container>
  );
}
