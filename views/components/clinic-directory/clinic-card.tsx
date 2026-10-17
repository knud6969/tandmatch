import Link from "next/link";
import type { ClinicListItemDto } from "@/lib/types/clinics";
import { cx } from "@/views/components/ui/cx";
import { ICONS } from "@/views/components/ui/icons";
import { TierBadge } from "@/views/components/clinic-directory/tier-badge";
import { ClinicFacts, ClinicWhere } from "@/views/components/clinic-directory/clinic-facts";

type ClinicCardProps = {
  clinic: ClinicListItemDto;
  hasServices: boolean;
  emergency: boolean;
  highlighted?: boolean;
  onHover?: (id: string | null) => void;
  // Med ?sag= kan patienten vælge klinikken til sammenligning og afsendelse (kun verificerede).
  // `contacted`: sagen er allerede sendt til klinikken, så den kan ikke vælges igen.
  compare?: { selected: boolean; disabled: boolean; contacted: boolean; onToggle: () => void } | null;
  // Med ?sag= fører kortet til profilen med sagen med, så valget bevares.
  profileHref?: string;
};

// Klinikkort i Airbnb-stil. Verificerede klinikker har billede/logo, blå kant og mærket "Verificeret"; basisklinikker er
// dæmpede, uden billede, og siger tydeligt, at de ikke er på TandMatch endnu. Hele kortet er et link til profilen.
export function ClinicCard({ clinic, hasServices, emergency, highlighted, onHover, compare, profileHref }: ClinicCardProps) {
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
            href={profileHref ?? `/klinikker/${clinic.id}`}
            className="no-underline after:absolute after:inset-0 after:content-[''] hover:underline"
          >
            {clinic.name}
          </Link>
        </h3>
        <ClinicWhere clinic={clinic} />
        <ClinicFacts clinic={clinic} hasServices={hasServices} emergency={emergency} />
      </div>

      {compare && clinic.canReceiveLeads && compare.contacted && (
        <p className="relative z-10 flex min-h-12 items-center border-t border-line bg-surface-muted px-4 text-base font-semibold text-ink-muted">
          Du har allerede kontaktet klinikken
        </p>
      )}
      {compare && clinic.canReceiveLeads && !compare.contacted && (
        <label
          className={cx(
            "relative z-10 flex min-h-12 cursor-pointer items-center gap-3 border-t px-4 text-base font-semibold",
            compare.selected ? "border-brand-200 bg-brand-50 text-brand-800" : "border-line text-ink",
            compare.disabled && !compare.selected && "cursor-not-allowed opacity-60",
          )}
        >
          <input
            type="checkbox"
            className="size-5 accent-brand-600"
            checked={compare.selected}
            disabled={compare.disabled && !compare.selected}
            onChange={compare.onToggle}
          />
          Vælg til kontakt
          <span className="sr-only">: {clinic.name}</span>
        </label>
      )}
    </li>
  );
}
