import { redirect } from "next/navigation";

// Weben er kun for klinikker, så oprettelse går direkte til klinikformularen (features/site 6.1). Siden findes kun for gamle links.
export default function OpretPage() {
  redirect("/opret/klinik");
}
