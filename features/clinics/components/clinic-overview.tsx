import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
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
      todoText: "Vælg dine behandlingskategorier, og angiv pris og varighed på behandlingerne.",
    },
    {
      href: "/klinik/aabningstider",
      title: "Åbningstider",
      done: clinic.openingHours.length > 0,
      doneText: `${clinic.openingHours.length} tidsrum i ugeskemaet.`,
      todoText: "Angiv ugeskema og eventuelle akutvinduer, så patienter kan se ledige tider.",
    },
    {
      href: "/klinik/tandlaeger",
      title: "Tandlæger og portefølje",
      done: clinic.dentists.length > 0,
      doneText: `${clinic.dentists.length} tandlæge${clinic.dentists.length === 1 ? "" : "r"}, ${portraits} med portræt, ${portfolio} porteføljebilleder.`,
      todoText: "Tilføj mindst én tandlæge. Portrætter og før/efter-billeder gør profilen mere troværdig.",
    },
  ];
}

// Klinikkens status og hvad der mangler i opsætningen (indbakken står over den på /klinik).
export function ClinicOverview({ clinic: data }: { clinic: OwnClinicDto }) {
  const steps = stepsFor(data);
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold text-ink">{data.name}</h2>
          <Badge tone={data.status === "verified" ? "brand" : "warning"}>{CLINIC_STATUS_LABEL[data.status]}</Badge>
        </div>
        <p className="text-base text-ink-muted">
          {data.address}, {data.postalCode} {data.city} · CVR {data.cvr}
        </p>
      </Card>

      <section aria-labelledby="opsaetning" className="flex flex-col gap-3">
        <h2 id="opsaetning" className="text-xl font-semibold text-ink">
          Opsætning: {doneCount} af {steps.length} trin er klar
        </h2>
        <ul className="grid gap-3">
          {steps.map((step) => (
            <li key={step.href}>
              <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-ink">{step.title}</h3>
                    <Badge tone={step.done ? "brand" : "warning"}>{step.done ? "Klar" : "Mangler"}</Badge>
                  </div>
                  <p className="text-base text-ink-muted">{step.done ? step.doneText : step.todoText}</p>
                </div>
                <LinkButton href={step.href} variant={step.done ? "secondary" : "primary"} className="sm:shrink-0">
                  {step.done ? "Se og ret" : "Udfyld"}
                </LinkButton>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
