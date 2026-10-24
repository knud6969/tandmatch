import Link from "next/link";
import type { ClinicListItemDto } from "@/lib/clinics/types/clinics";
import { clinicProfileHref } from "@/features/clinics/utils/clinic-query";
import { cx } from "@/components/ui/cx";
import { ICONS } from "@/components/ui/icons";
import { TierBadge } from "@/features/clinics/components/tier-badge";
import { ClinicFacts, ClinicWhere } from "@/features/clinics/components/clinic-facts";

type ClinicCardProps = {
  clinic: ClinicListItemDto;
  hasServices: boolean;
  emergency: boolean;
  highlighted?: boolean;
  onHover?: (id: string | null) => void;
  // Profillinket med oversigtens filtre, så "Alle klinikker" fører tilbage til dem.
  profileHref?: string;
};

// Klinikkort i Airbnb-stil. Verificerede klinikker har billede/logo, blå kant og mærket "Verificeret"; basisklinikker er
// dæmpede, uden billede, og siger tydeligt, at de ikke er på TandMatch endnu. Hele kortet er et link til profilen.
export function ClinicCard({ clinic, hasServices, emergency, highlighted, onHover, profileHref }: ClinicCardProps) {
  const full = clinic.tier === "full";
  return (
    <li
      onMouseEnter={() => onHover?.(clinic.id)}
      onMouseLeave={() => onHover?.(null)}
      className={cx(
        "relative flex flex-col overflow-hidden rounded-card border transition-shadow focus-within:shadow-raised hover:shadow-raised",
        full ? "border-brand-200 bg-surface shadow-card" : "border-dashed border-field-border bg-surface-muted",
        highlighted && "ring-2 ring-brand-500",
      )}
    >
      <div
        className={cx(
          "flex aspect-[16/9] items-center justify-center",
          full ? "bg-brand-50 text-brand-700" : "bg-line/60 text-ink-muted",
        )}
      >
        {full && clinic.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Offentlig URL fra storage; ingen next/image-optimering i prototypen.
          <img src={clinic.logoUrl} alt="" className="size-full object-contain p-6" loading="lazy" />
        ) : (
          <span className="[&_svg]:size-14">{ICONS.clinic}</span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <TierBadge tier={clinic.tier} />
        </div>
        <h3 className="text-lg font-semibold leading-snug text-ink">
          <Link
            href={profileHref ?? clinicProfileHref(clinic.id, "")}
            className="no-underline after:absolute after:inset-0 after:content-[''] hover:underline"
          >
            {clinic.name}
          </Link>
        </h3>
        <ClinicWhere clinic={clinic} />
        <ClinicFacts clinic={clinic} hasServices={hasServices} emergency={emergency} />
      </div>

    </li>
  );
}
