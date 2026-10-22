import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

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
  // role="alert" bruges til fejl efter en handling, så skærmlæsere læser dem straks.
  role?: "alert" | "status";
  className?: string;
};

export function Alert({ tone = "info", title, children, role = "status", className }: AlertProps) {
  return (
    <div role={role} className={cx("rounded-card border p-4 text-base leading-relaxed", tones[tone], className)}>
      {title && <p className="mb-1 font-semibold">{title}</p>}
      {children}
    </div>
  );
}
