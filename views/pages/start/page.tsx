import type { Metadata } from "next";
import { StartForm } from "@/views/components/start/start-form";

export const metadata: Metadata = {
  title: "Beskriv dit problem",
  description: "Beskriv dit tandproblem med dine egne ord og få hjælp til at finde klinikker. AI’en beskriver, klinikken vurderer.",
};

export default function StartPage() {
  return <StartForm />;
}
