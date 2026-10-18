import type { Metadata } from "next";
import { BookingsList } from "@/views/components/patient/bookings-list";
import { Container } from "@/views/components/ui/container";
import { PageIntro } from "@/views/components/ui/page-intro";

export const metadata: Metadata = { title: "Mine bookinger" };

export default function PatientBookingsPage() {
  return (
    <Container>
      <PageIntro title="Mine bookinger">
        <p>Her ser du dine kommende og tidligere tider hos klinikkerne.</p>
      </PageIntro>
      <BookingsList />
    </Container>
  );
}
