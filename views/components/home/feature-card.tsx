import type { ReactNode } from "react";
import { IconTile, type IconName } from "@/views/components/ui/icons";

// Kort med ikon, titel og tekst. Bruges til fordele og trin.
export function FeatureCard({ icon, title, children, step }: { icon: IconName; title: string; children: ReactNode; step?: number }) {
  return (
    <li className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card">
      <IconTile name={icon} />
      <h3 className="text-lg font-semibold text-ink">
        {step !== undefined && <span className="text-brand-700">{step}. </span>}
        {title}
      </h3>
      <p className="text-base leading-relaxed text-ink-muted">{children}</p>
    </li>
  );
}
