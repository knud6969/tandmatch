import type { NOTIFICATION_SETTING_KEYS } from "@/lib/clinics/constants/notification-settings";

// Klinikkens valg af e-mail og browser-push pr. type (clinics 10.19).
export type ClinicNotificationSettingsDto = { [K in (typeof NOTIFICATION_SETTING_KEYS)[number]]: boolean };
