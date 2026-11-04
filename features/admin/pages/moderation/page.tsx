import type { Metadata } from "next";
import { ADMIN_MODERATION_TITLE } from "@/lib/admin/constants/admin";
import { ModerationQueue } from "@/features/admin/components/moderation-queue";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: ADMIN_MODERATION_TITLE };

export default function AdminModerationPage() {
  return (
    <Container size="wide">
      <PageIntro title={ADMIN_MODERATION_TITLE}>
        <p>Nye anmeldelser og klinikkers svar vises først, når de er godkendt. Afvisninger kræver en begrundelse.</p>
      </PageIntro>
      <ModerationQueue />
    </Container>
  );
}
