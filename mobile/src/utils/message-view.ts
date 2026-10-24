import { CLINIC_SENDER_LABEL, OWN_SENDER_LABEL } from "@/lib/leads/constants/messages";
import type { MessageDto } from "@/lib/leads/types/messages";
import { THREAD_CLOSED_TEXT } from "@/lib/common/constants/error-texts";

// Beskedtråden (architecture 10.12, 13.4).

// Afsendernavnet over en besked: "Dig" eller "Klinikken" (også når klinikkontoen er slettet).
export const senderLabel = (message: Pick<MessageDto, "fromMe">) => (message.fromMe ? OWN_SENDER_LABEL : CLINIC_SENDER_LABEL);

export const THREAD_CLOSED_NOTICE = THREAD_CLOSED_TEXT;

// Ældste først. Serverens rækkefølge bevares ved lige tid.
export function sortMessages(messages: MessageDto[]): MessageDto[] {
  return [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// Efter en sendt besked lægges den til listen, indtil næste hentning; en besked, der allerede er hentet, tælles ikke to gange.
export function appendMessage(messages: MessageDto[], created: MessageDto): MessageDto[] {
  return messages.some((m) => m.id === created.id) ? messages : sortMessages([...messages, created]);
}

// Er der kommet noget nyt, siden sidst? Bruges til kun at rulle ned, når listen faktisk er ændret.
export const messagesChanged = (before: MessageDto[], after: MessageDto[]) =>
  before.length !== after.length || before.some((m, i) => m.id !== after[i]?.id);
