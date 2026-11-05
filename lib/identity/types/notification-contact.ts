// Patientens valgte e-mail og telefonnummer til notifikationer (identity 4.3). null = ikke valgt: e-mail falder tilbage til
// login-adressen, uden nummer sendes der ingen SMS.
export type NotificationContactDto = { email: string | null; phone: string | null };

// Til dataeksporten.
export type NotificationContactExportDto = NotificationContactDto & { updatedAt: string };
