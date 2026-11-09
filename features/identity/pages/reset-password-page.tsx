import type { Metadata } from "next";
import { ResetPasswordForm, type RecoveryLink } from "@/features/identity/components/reset-password-form";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Vælg ny adgangskode", referrer: "no-referrer" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (value: string | string[] | undefined) => (typeof value === "string" && value.length <= 512 ? value : undefined);

// Linket fra e-mailen (architecture 10.2): `?code=` (PKCE) eller `?token_hash=&type=recovery`. Ved en fejl sender Supabase
// `?error=` i stedet.
export default async function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const type = one(params.type);
  const link: RecoveryLink = {
    code: one(params.code),
    tokenHash: one(params.token_hash),
    invalid: params.error !== undefined || (type !== undefined && type !== "recovery"),
  };
  return (
    <Container>
      <PageIntro title="Vælg ny adgangskode" />
      <Card>
        <ResetPasswordForm link={link} />
      </Card>
    </Container>
  );
}
