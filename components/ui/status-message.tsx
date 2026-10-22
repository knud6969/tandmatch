import { Alert } from "@/components/ui/alert";
import type { ActionMessage } from "@/platform/ui-utils/use-action";

// Viser beskeden fra useAction: fejl som alert, succes som status.
export function StatusMessage({ message }: { message: ActionMessage | null }) {
  if (!message) return null;
  return (
    <Alert tone={message.tone} role={message.tone === "danger" ? "alert" : "status"}>
      {message.text}
    </Alert>
  );
}
