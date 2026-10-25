import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { CLINIC_STATUS_LABEL } from "@/lib/clinics/constants/clinics";
import type { OwnClinicDto } from "@/lib/clinics/types/clinics";

type Step = { href: string; title: string; done: boolean; doneText: string; todoText: string };

function stepsFor(clinic: OwnClinicDto): Step[] {
  const portraits = clinic.dentists.filter((d) => d.photoUrl).length;
  const portfolio = clinic.dentists.reduce((sum, d) => sum + d.portfolio.length, 0);
  const missingProfile = [!clinic.description && "beskrivelse", !clinic.logoUrl && "logo"].filter(Boolean);
  return [
    {
      href: "/klinik/profil",
      title: "Profil",
      done: Boolean(clinic.description && clinic.logoUrl),
      doneText: "Beskrivelse og logo er på plads.",
      todoText: `Mangler ${missingProfile.join(" og ")}.`,
    },
    {
      href: "/klinik/prisliste",
      title: "Prisliste",
      done: clinic.allPrices.length > 0,
      doneText: `${clinic.allPrices.length} behandlinger med pris og varighed.`,
      todoText: "Angiv pris og varighed på dine behandlinger.",
    },
    {
      href: "/klinik/aabningstider",
      title: "Åbningstider",
      done: clinic.openingHours.length > 0,
      doneText: `${clinic.openingHours.length} tidsrum i ugeskemaet.`,
      todoText: "Angiv ugeskema, så patienter kan se ledige tider.",
    },
    {
      href: "/klinik/tandlaeger",
      title: "Tandlæger og portefølje",
      done: clinic.dentists.length > 0,
      doneText: `${clinic.dentists.length} tandlæge${clinic.dentists.length === 1 ? "" : "r"}, ${portraits} med portræt, ${portfolio} porteføljebilleder.`,
      todoText: "Tilføj mindst én tandlæge.",
    },
  ];
}

// Én linje på /klinik, kun når noget mangler i opsætningen (features/clinics/README.md 6.3). Hele oversigten står på Klinikprofil.
export function ClinicSetupNotice({ clinic }: { clinic: OwnClinicDto }) {
  const missing = stepsFor(clinic).filter((step) => !step.done);
  if (missing.length === 0) return null;
  return (
    <p className="text-sm text-ink" data-testid="opsaetning-mangler">
      <span className="font-semibold">Opsætningen mangler:</span> {missing.map((step) => step.title.toLowerCase()).join(", ")}.{" "}
      <Link href="/klinik/profil" className="font-semibold text-brand-700">
        Gå til Klinikprofil
      </Link>
    </p>
  );
}

// Klinikkens status og hvad der mangler i opsætningen, øverst på Klinikprofil.
export function ClinicOverview({ clinic: data }: { clinic: OwnClinicDto }) {
  const steps = stepsFor(data);
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <Card className="flex flex-col gap-3" data-testid="opsaetning">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-ink">{data.name}</h2>
        <Badge tone={data.status === "verified" ? "brand" : "warning"}>{CLINIC_STATUS_LABEL[data.status]}</Badge>
      </div>
      <p className="text-sm text-ink-muted">
        {data.address}, {data.postalCode} {data.city} · CVR {data.cvr}
      </p>
      <section aria-labelledby="opsaetning-titel" className="flex flex-col gap-2">
        <h3 id="opsaetning-titel" className="text-sm font-semibold text-ink">
          Opsætning: {doneCount} af {steps.length} klar
        </h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {steps.map((step) => (
            <li key={step.href}>
              <Link
                href={step.href}
                className="flex min-h-11 flex-col gap-0.5 rounded-control border border-line px-3 py-2 no-underline hover:border-brand-400"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  {step.title}
                  <Badge tone={step.done ? "brand" : "warning"}>{step.done ? "Klar" : "Mangler"}</Badge>
                </span>
                <span className="text-xs text-ink-muted">{step.done ? step.doneText : step.todoText}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </Card>
  );
}
