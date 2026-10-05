import { Alert } from "@/components/ui/alert";

// Obligatorisk tydelig besked om AI-grænser (CLAUDE.md, EU MDR). Vises hvor AI'en er involveret.
export function AiDisclaimer() {
  return (
    <Alert tone="info" title="AI'en giver ikke medicinsk rådgivning">
      <p>
        AI-assistenten beskriver og strukturerer det, du skriver. Den stiller ikke diagnose, vurderer ikke
        alvorlighed, foreslår ikke behandling og oplyser ikke pris. Det er tandlægen, der vurderer din situation.
      </p>
    </Alert>
  );
}
