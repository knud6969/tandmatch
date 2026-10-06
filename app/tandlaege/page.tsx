import type { Metadata } from "next";
import { InboxList } from "@/components/dentist/inbox-list";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Indbakke" };

// Indbakken: forespørgsler sendt til tandlægen (architecture 6.3, 10.6). Data hentes via /api/inbox.
export default function DentistInboxPage() {
  return (
    <>
      <PageIntro title="Indbakke">
        <p>Forespørgsler fra patienter, der matcher din profil. Du ser kategori, område og afstand, indtil du åbner en forespørgsel.</p>
      </PageIntro>
      <InboxList />
    </>
  );
}
