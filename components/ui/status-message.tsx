import { Alert } from "@/components/ui/alert";
import { FormError } from "@/components/ui/form-error";
import type { ActionMessage } from "@/platform/ui-utils/use-action";

// Viser beskeden fra useAction: fejl som alert (fokus og rul til den), succes som rolig status.
export function StatusMessage({ message }: { message: ActionMessage | null }) {
  if (!message) return null;
  if (message.tone === "danger") return <FormError message={message.text} />;
  return <Alert tone={message.tone}>{message.text}</Alert>;
}
