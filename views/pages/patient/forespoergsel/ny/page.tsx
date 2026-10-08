import type { Metadata } from "next";
import { z } from "zod";
import { NewRequestForm } from "@/views/components/patient/new-request-form";
import { Card } from "@/views/components/ui/card";
import { PageIntro } from "@/views/components/ui/page-intro";
import { COSMETIC_CATEGORIES } from "@/lib/constants/categories";

export const metadata: Metadata = { title: "Ny forespørgsel" };

// Patienter med konto starter en forespørgsel her i stedet for /start (architecture 6.2, 7.1).
export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ kategori?: string }> }) {
  const { kategori } = await searchParams;
  const parsed = z.enum(COSMETIC_CATEGORIES).safeParse(kategori);
  return (
    <>
      <PageIntro title="Ny forespørgsel">
        <p>Vælg hvad din henvendelse handler om. Du beskriver dit ønske i de næste trin.</p>
      </PageIntro>
      <Card>
        <NewRequestForm initialCategory={parsed.success ? parsed.data : null} />
      </Card>
    </>
  );
}
