import type { NotificationInboxDto } from "@/lib/common/types/notifications";
import type { NotificationContactDto } from "@/lib/identity/types/notification-contact";
import { apiRequest } from "./client";

// Klokken (platform 14.11): de nyeste notifikationer og antal ulæste. Kun patienter med konto.
export function getInbox(): Promise<NotificationInboxDto> {
  return apiRequest<NotificationInboxDto>("/api/notifications");
}

// Markerer de angivne som læst, eller alle ved undefined.
export function markNotificationsRead(ids?: string[]): Promise<void> {
  return apiRequest<void>("/api/notifications/read", { method: "POST", json: ids ? { ids } : {} });
}

// Patientens e-mail og telefonnummer til notifikationer (identity 10.20).
export function getNotificationContact(): Promise<NotificationContactDto> {
  return apiRequest<NotificationContactDto>("/api/patients/me/notification-contact");
}

export function saveNotificationContact(input: NotificationContactDto): Promise<NotificationContactDto> {
  return apiRequest<NotificationContactDto>("/api/patients/me/notification-contact", { method: "PUT", json: input });
}
