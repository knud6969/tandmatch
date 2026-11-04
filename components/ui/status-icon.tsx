import type { AlertTone } from "@/components/ui/alert";

// Lille statusikon (dekorativt) i tonens farve. Samme ikon følger fejl i felter, bannere og indlæsningsfejl, så en fejl
// ser ens ud overalt. Appen bruger samme tegn (mobile/src/components/ui/status-icon.tsx).
const PATHS: Record<AlertTone, string> = {
  danger: "M12 7v6M12 16.5v.01",
  warning: "M12 7v6M12 16.5v.01",
  success: "M8 12.5l2.7 2.7L16 9.5",
  info: "M12 11v5.5M12 7.5v.01",
};

export function StatusIcon({ tone = "danger", className }: { tone?: AlertTone; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className ?? "mt-0.5 shrink-0"}
    >
      <circle cx="12" cy="12" r="9.5" />
      <path d={PATHS[tone]} />
    </svg>
  );
}
