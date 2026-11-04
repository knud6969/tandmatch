import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { StatusIcon } from "@/components/ui/status-icon";

export type AlertTone = "info" | "warning" | "danger" | "success";

const tones: Record<AlertTone, string> = {
  info: "border-info-line bg-info-bg text-info-ink",
  warning: "border-warning-line bg-warning-bg text-warning-ink",
  danger: "border-danger-line bg-danger-bg text-danger-ink",
  success: "border-success-line bg-success-bg text-success-ink",
};

type AlertProps = {
  tone?: AlertTone;
  title?: string;
  children: ReactNode;
  // Fejl (danger) læses straks op af skærmlæsere (role="alert"); alt andet er rolig status. Kan overstyres, fx til en
  // advarsel, der kræver et svar (role="alert").
  role?: "alert" | "status";
  className?: string;
};

// Fælles boks til beskeder i en tone. Fejl, advarsler og succes får et ikon, så de ikke kun adskilles på farve.
export function Alert({ tone = "info", title, children, role, className }: AlertProps) {
  return (
    <div
      role={role ?? (tone === "danger" ? "alert" : "status")}
      className={cx("flex gap-3 rounded-card border p-4 text-base leading-relaxed", tones[tone], className)}
    >
      {tone !== "info" && <StatusIcon tone={tone} />}
      <div className="min-w-0 flex-1">
        {title && <p className="mb-1 font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
}
