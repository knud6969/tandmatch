import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton, type ButtonVariant } from "@/components/ui/button";

type EntryButtonProps = {
  href: string;
  // Når false, findes siden endnu ikke: knappen er deaktiveret og markeret "Kommer snart" (ingen 404).
  ready: boolean;
  variant?: ButtonVariant;
  children: ReactNode;
};

export function EntryButton({ href, ready, variant = "primary", children }: EntryButtonProps) {
  if (ready) {
    return (
      <LinkButton href={href} variant={variant}>
        {children}
      </LinkButton>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button variant={variant} disabled aria-disabled="true">
        {children}
      </Button>
      <Badge tone="warning">Kommer snart</Badge>
    </span>
  );
}
