import Link from "next/link";
import { DIRECTORY_HREF, DIRECTORY_READY } from "@/lib/navigation/entries";

const linkClass = "text-brand-700 underline underline-offset-4 hover:text-brand-800";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-surface-muted">
      <div className="mx-auto flex max-w-wide flex-col gap-4 px-4 py-8 text-sm leading-relaxed text-ink-muted sm:px-6">
        <p className="text-base font-bold tracking-tight text-brand-700">TandMatch</p>
        <p className="max-w-prose">
          AI’en giver kun en foreløbig vurdering. Klinikken vurderer altid din situation endeligt.
        </p>
        <nav aria-label="Sidefod">
          <ul className="flex flex-wrap gap-x-6 gap-y-3">
            {DIRECTORY_READY && (
              <li>
                <Link href={DIRECTORY_HREF} className={linkClass}>
                  Find en klinik
                </Link>
              </li>
            )}
            <li>
              <Link href="/vilkaar" className={linkClass}>
                Brugervilkår
              </Link>
            </li>
            <li>
              <Link href="/privatliv" className={linkClass}>
                Privatlivspolitik
              </Link>
            </li>
          </ul>
        </nav>
        <p>Prototype. Vilkår og privatlivspolitik er pladsholdertekster.</p>
      </div>
    </footer>
  );
}
