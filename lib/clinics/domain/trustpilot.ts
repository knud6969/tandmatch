import type { TrustpilotInfo } from "@/lib/common/types/common";

// Mærkat efter hvem der har indtastet tallene (architecture 8.4). Trustpilot hentes eller scrapes aldrig af TandMatch.
export function trustpilotSource(trustpilot: NonNullable<TrustpilotInfo>): string {
  return trustpilot.enteredBy === "clinic" ? "angivet af klinikken" : "angivet af TandMatch";
}
