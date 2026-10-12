import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 text-sm leading-relaxed text-ink-muted sm:px-6">
        <p>AI’en giver kun en foreløbig vurdering. Klinikken vurderer altid din situation endeligt.</p>
        <nav aria-label="Juridisk">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            <li>
              <Link href="/vilkaar" className="text-brand-700 underline underline-offset-4">
                Brugervilkår
              </Link>
            </li>
            <li>
              <Link href="/privatliv" className="text-brand-700 underline underline-offset-4">
                Privatlivspolitik
              </Link>
            </li>
          </ul>
        </nav>
        <p className="text-ink-muted">Prototype. Vilkår og privatlivspolitik er pladsholdertekster.</p>
      </div>
    </footer>
  );
}
