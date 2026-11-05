import { INBOX_BELL_LABEL, INBOX_UNREAD_LABEL } from "@/lib/common/constants/notifications";
import { formatUnreadBadge } from "@/lib/common/domain/notifications";
import type { NotificationItemDto } from "@/lib/common/types/notifications";
import { putNotificationContactSchema } from "@/lib/identity/schemas/notification-contact";
import type { NotificationContactDto } from "@/lib/identity/types/notification-contact";
import { fieldErrorsFrom, type FieldErrors } from "~/utils/field-errors";
import { notificationTarget } from "~/utils/notification-routing";

// Ren logik til klokken og kontaktformularen (mobile 13.10), uden React Native, så den kan testes.

// "Notifikationer" eller "Notifikationer, 3 ulæste" (skærmlæseren); "99+" over 99.
export function bellLabel(unread: number): string {
  return unread > 0 ? `${INBOX_BELL_LABEL}, ${formatUnreadBadge(unread)} ${INBOX_UNREAD_LABEL}` : INBOX_BELL_LABEL;
}

// Tallet på klokken; null, når der ikke er nogen ulæste.
export function bellBadge(unread: number): string | null {
  return unread > 0 ? formatUnreadBadge(unread) : null;
}

// Hvor et tryk på en notifikation fører hen: kun tilladte stier, ellers Mine sager (samme regel som push).
export function inboxItemTarget(item: Pick<NotificationItemDto, "path">): string {
  return notificationTarget({ path: item.path });
}

// Kun ulæste skal markeres, når man trykker.
export function needsMarking(item: Pick<NotificationItemDto, "readAt">): boolean {
  return item.readAt === null;
}

export type ContactForm = { email: string; phone: string };

// Fra formularens tekstfelter til API'ets input: tomme felter bliver null (rydder valget), resten valideres med det fælles
// skema (telefon: phoneSchema).
export function parseContactForm(form: ContactForm): { ok: true; data: NotificationContactDto } | { ok: false; errors: FieldErrors<keyof ContactForm> } {
  const parsed = putNotificationContactSchema.safeParse({
    email: form.email.trim() === "" ? null : form.email.trim(),
    phone: form.phone.trim() === "" ? null : form.phone.trim(),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrorsFrom<keyof ContactForm>(parsed.error) };
  return { ok: true, data: parsed.data };
}
