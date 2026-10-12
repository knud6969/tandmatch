import { Alert } from "@/views/components/ui/alert";

// Obligatorisk tydelig besked om AI-grænser (CLAUDE.md, EU MDR). Vises hvor AI’en er involveret.
export function AiDisclaimer() {
  return (
    <Alert tone="info" title="Foreløbig vurdering fra AI">
      <p>
        AI-assistenten kan forklare og give en foreløbig vurdering ud fra det, du skriver. Den er ikke en
        diagnose og ikke en garanti. Klinikken laver den endelige vurdering.
      </p>
    </Alert>
  );
}
