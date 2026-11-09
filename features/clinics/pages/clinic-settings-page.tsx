import type { Metadata } from "next";
import Link from "next/link";
import { ClinicForm } from "@/features/clinics/components/clinic-form";
import { ClinicOverviewLoader } from "@/features/clinics/components/clinic-overview-loader";
import { ClinicSettingsNav } from "@/features/clinics/components/clinic-settings-nav";
import { Container } from "@/components/ui/container";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Klinikprofil" };

export default function ClinicPage() {
  return (
    <Container>
      <ClinicSettingsNav />
      <PageIntro title="Klinikprofil">
        <p>Det her ser patienterne på klinikkens profil.</p>
      </PageIntro>
      <ClinicOverviewLoader />
      <Link href="/klinik/profil/forhaandsvisning" className="inline-flex min-h-11 w-fit items-center font-semibold text-brand-700 underline">
        Se din profil som patienten ser den
      </Link>
      <ClinicForm />
    </Container>
  );
}
