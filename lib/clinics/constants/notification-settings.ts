// Klinikkens notifikationsvalg (clinics 4.3 `clinic_notification_settings`). Standardværdierne skal svare til
// kolonnernes default i supabase/migrations/20261105000200_notification_outbox.sql, og en manglende række betyder standard.
export const NOTIFICATION_SETTING_KEYS = [
  "emailNewLead",
  "emailNewMessage",
  "emailBookingChanges",
  "emailBookingReminder",
  "webPushNewLead",
  "webPushNewMessage",
  "webPushBookingChanges",
  "webPushBookingReminder",
] as const;

export const DEFAULT_NOTIFICATION_SETTINGS = {
  emailNewLead: true,
  emailNewMessage: true,
  emailBookingChanges: true,
  emailBookingReminder: true,
  webPushNewLead: true,
  webPushNewMessage: true,
  webPushBookingChanges: true,
  webPushBookingReminder: false,
} as const satisfies Record<(typeof NOTIFICATION_SETTING_KEYS)[number], boolean>;

// Rækkefølgen i UI'et: e-mail og browser har samme fire valg.
export const NOTIFICATION_SETTING_LABEL = {
  newLead: "Ny henvendelse",
  newMessage: "Ny besked fra en patient",
  bookingChanges: "Ny, flyttet eller aflyst tid",
  bookingReminder: "Påmindelse dagen før en booket tid",
} as const;

export const NOTIFICATION_SETTING_HINT = {
  newMessage: "Højst én notifikation pr. henvendelse pr. 15 minutter",
} as const;

// SQL-kolonnerne pr. felt (repositoryet bruger dem).
export const NOTIFICATION_SETTING_COLUMN = {
  emailNewLead: "email_new_lead",
  emailNewMessage: "email_new_message",
  emailBookingChanges: "email_booking_changes",
  emailBookingReminder: "email_booking_reminder",
  webPushNewLead: "web_push_new_lead",
  webPushNewMessage: "web_push_new_message",
  webPushBookingChanges: "web_push_booking_changes",
  webPushBookingReminder: "web_push_booking_reminder",
} as const satisfies Record<(typeof NOTIFICATION_SETTING_KEYS)[number], string>;

// Rækkerne i UI'et: ét label pr. type, med feltet for e-mail og for browser.
export const NOTIFICATION_SETTING_ROWS = [
  { label: "newLead", email: "emailNewLead", webPush: "webPushNewLead" },
  { label: "newMessage", email: "emailNewMessage", webPush: "webPushNewMessage" },
  { label: "bookingChanges", email: "emailBookingChanges", webPush: "webPushBookingChanges" },
  { label: "bookingReminder", email: "emailBookingReminder", webPush: "webPushBookingReminder" },
] as const satisfies readonly {
  label: keyof typeof NOTIFICATION_SETTING_LABEL;
  email: (typeof NOTIFICATION_SETTING_KEYS)[number];
  webPush: (typeof NOTIFICATION_SETTING_KEYS)[number];
}[];

// Tekster på /klinik/profil (clinics 6.3), sektionen "Notifikationer".
export const NOTIFICATION_SETTINGS_TEXT = {
  title: "Notifikationer",
  intro: "Vi sender e-mails til jeres login-e-mail. E-mailen indeholder aldrig oplysninger om patienten.",
  emailGroup: "E-mail",
  browserGroup: "Browser",
  enable: "Slå notifikationer til i denne browser",
  disable: "Slå fra",
  browserOn: "Notifikationer er slået til i denne browser.",
  browserOff: "Notifikationer er slået fra i denne browser. Slå dem til for at vælge, hvad du vil have besked om.",
  denied: "Browseren blokerer notifikationer for TandMatch. Tillad dem i browserens indstillinger for siden, og prøv igen.",
  unsupported:
    "Denne browser understøtter ikke notifikationer. På iPhone skal TandMatch først lægges på hjemmeskærmen (Del, derefter Føj til hjemmeskærm).",
  missingKey: "Notifikationer i browseren er ikke sat op endnu på dette miljø.",
  enabledDone: "Notifikationer er slået til i denne browser.",
  disabledDone: "Notifikationer er slået fra i denne browser.",
  save: "Gem notifikationer",
} as const;
