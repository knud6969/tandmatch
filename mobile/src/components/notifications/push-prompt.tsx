import { usePush } from "~/hooks/use-push";
import { shouldShowPushPrompt } from "~/utils/push-prompt";
import { PushPromptCard } from "./push-prompt-card";

// Kortet efter en sendt henvendelse (mobile 13.10): vises kun, når telefonens tilladelse ikke er afgjort, og patienten ikke har valgt "Ikke nu".
export function PushPrompt() {
  const push = usePush();
  if (!shouldShowPushPrompt({ permission: push.permission, dismissed: push.dismissed, hasProjectId: push.hasProjectId, hasAccount: true })) return null;
  return <PushPromptCard onEnable={() => void push.enable()} onDismiss={() => void push.dismiss()} />;
}
