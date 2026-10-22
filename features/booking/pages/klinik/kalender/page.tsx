import type { Metadata } from "next";
import { ClinicCalendar } from "@/features/booking/components/calendar";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";

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
