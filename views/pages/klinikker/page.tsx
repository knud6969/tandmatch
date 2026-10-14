import type { Metadata } from "next";
import { Suspense } from "react";
import { ClinicDirectory } from "@/views/components/clinic-directory/clinic-directory";

export const metadata: Metadata = {
  title: "Find en klinik",
  description: "Sammenlign tandlægeklinikker på pris, bedømmelse, afstand og ledig tid.",
};

export default function ClinicDirectoryPage() {
  return (
    <Suspense fallback={<p role="status" className="px-4 py-8 text-base text-ink-muted sm:px-6">Indlæser …</p>}>
      <ClinicDirectory />
    </Suspense>
  );
}
