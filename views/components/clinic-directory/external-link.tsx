import type { ReactNode } from "react";
import { EXTERNAL_LINK_REL } from "@/views/utils/links";
import { cx } from "@/views/components/ui/cx";

// Link til en ekstern side (klinikkens website, Trustpilot). Åbner i ny fane og følges ikke af søgemaskiner.
export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel={EXTERNAL_LINK_REL}
      className={cx("inline-flex min-h-11 items-center gap-1 font-semibold text-brand-700 underline-offset-2 hover:underline", className)}
    >
      {children}
      <span className="sr-only">(åbner i ny fane)</span>
    </a>
  );
}
