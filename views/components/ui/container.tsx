import type { ReactNode } from "react";
import { cx } from "@/views/components/ui/cx";

type ContainerProps = {
  children: ReactNode;
  // "narrow" til formularer og læsetekst, "wide" til oversigter med flere kort.
  size?: "narrow" | "wide";
  className?: string;
};

const sizes = {
  narrow: "max-w-narrow",
  wide: "max-w-wide",
} as const;

export function Container({ children, size = "narrow", className }: ContainerProps) {
  return (
    <div className={cx("mx-auto flex w-full flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12", sizes[size], className)}>
      {children}
    </div>
  );
}
