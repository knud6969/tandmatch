"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/cx";

// Undersiderne under fanen Klinikprofil (features/clinics/README.md 6.3). URL'erne er de samme som før.
const CLINIC_SETTINGS_PAGES = [
  { href: "/klinik/profil", label: "Profil" },
  { href: "/klinik/prisliste", label: "Prisliste" },
  { href: "/klinik/aabningstider", label: "Åbningstider" },
  { href: "/klinik/tandlaeger", label: "Tandlæger" },
] as const;

// Lokal undernavigation på de fire opsætningssider. Ruller vandret på smalle skærme.
export function ClinicSettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Klinikprofil" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1 rounded-pill bg-surface-muted p-1">
        {CLINIC_SETTINGS_PAGES.map((page) => {
          const active = pathname === page.href;
          return (
            <li key={page.href}>
              <Link
                href={page.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-11 items-center whitespace-nowrap rounded-pill px-4 text-sm font-semibold no-underline",
                  active ? "bg-surface text-brand-800 shadow-card" : "text-ink-muted hover:text-ink",
                )}
              >
                {page.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
