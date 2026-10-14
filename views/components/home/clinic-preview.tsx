import { ICONS } from "@/views/components/ui/icons";

// Illustrativt klinikkort (eksempel, ikke en rigtig klinik). Farveflade med ikon i stedet for foto.
export function ClinicPreview({ name, area, tone }: { name: string; area: string; tone: "a" | "b" | "c" }) {
  const bg = tone === "a" ? "bg-brand-100" : tone === "b" ? "bg-brand-200" : "bg-brand-50";
  return (
    <li className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className={`flex aspect-[4/3] items-center justify-center text-brand-700 ${bg}`}>
        <span className="[&_svg]:size-16">{ICONS.clinic}</span>
      </div>
      <div className="flex flex-col gap-1 p-4">
        <p className="text-base font-semibold text-ink">{name}</p>
        <p className="text-sm text-ink-muted">{area}</p>
        <p className="text-sm text-ink-muted">Bedømmelse, pris og ledig tid vises her</p>
      </div>
    </li>
  );
}
