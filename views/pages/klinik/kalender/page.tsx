import type { Metadata } from "next";
import { ClinicCalendar } from "@/views/components/clinic/calendar";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";

export const metadata: Metadata = { title: "Kalender" };

export default function ClinicCalendarPage() {
  return (
    <Container size="wide">
      <PageIntro title="Kalender">
        <p>Bookinger og reserverede akuttider. Patientens kontaktoplysninger vises, når tiden er booket.</p>
      </PageIntro>
      <ClinicCalendar />
    </Container>
  );
}
