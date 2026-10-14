import type { ClinicProfileDentistDto } from "@/lib/types/clinics";
import { ICONS } from "@/views/components/ui/icons";

// Klinikkens tandlæger med portræt, beskrivelse og portefølje (billeder klinikken har lagt ind med patientens samtykke).
export function DentistPortfolio({ dentists }: { dentists: ClinicProfileDentistDto[] }) {
  if (dentists.length === 0) {
    return <p className="text-base text-ink-muted">Klinikken har endnu ikke præsenteret sine tandlæger.</p>;
  }
  return (
    <ul className="flex flex-col gap-8">
      {dentists.map((dentist) => (
        <li key={dentist.id} className="flex flex-col gap-4">
          <div className="flex items-start gap-4">
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-brand-700">
              {dentist.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- Offentlig URL fra storage; ingen next/image-optimering i prototypen.
                <img src={dentist.photoUrl} alt={`Portræt af ${dentist.fullName}`} className="size-full object-cover" loading="lazy" />
              ) : (
                <span className="[&_svg]:size-9">{ICONS.tooth}</span>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-ink">{dentist.fullName}</h3>
              {dentist.title && <p className="text-base text-ink-muted">{dentist.title}</p>}
              {dentist.bio && <p className="mt-2 whitespace-pre-line text-base leading-relaxed text-ink">{dentist.bio}</p>}
            </div>
          </div>
          {dentist.portfolio.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-ink-muted">Eksempler på behandlinger</p>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {dentist.portfolio.map((item) => (
                  <li key={item.id} className="overflow-hidden rounded-control border border-line">
                    {/* eslint-disable-next-line @next/next/no-img-element -- Offentlig URL fra storage; ingen next/image-optimering i prototypen. */}
                    <img src={item.imageUrl} alt={item.caption ?? "Porteføljebillede"} className="aspect-square w-full object-cover" loading="lazy" />
                    {(item.caption || item.serviceName) && (
                      <p className="p-2 text-sm text-ink-muted">
                        {item.serviceName && <span className="block font-semibold text-ink">{item.serviceName}</span>}
                        {item.caption}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
