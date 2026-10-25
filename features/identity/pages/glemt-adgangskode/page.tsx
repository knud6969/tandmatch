import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/features/identity/components/forgot-password-form";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Glemt adgangskode" };

export default function ForgotPasswordPage() {
  return (
    <Container>
      <PageIntro title="Glemt adgangskode">
        <p>Skriv klinikkens login-e-mail, så sender vi et link til at vælge en ny adgangskode.</p>
      </PageIntro>
      <Card>
        <ForgotPasswordForm />
      </Card>
    </Container>
  );
}
