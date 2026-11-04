import { z } from "zod";
import { MODERATION_STATUSES } from "@/lib/booking/constants/reviews";
import { ADMIN_REASON_MAX_CHARS, MODERATION_KINDS } from "@/lib/admin/constants/admin";
import { CLINIC_STATUSES } from "@/lib/clinics/constants/clinics";

const reason = z.string().trim().max(ADMIN_REASON_MAX_CHARS, `Begrundelsen må højst være ${ADMIN_REASON_MAX_CHARS} tegn.`);

// GET /api/admin/clinics?status=&q=
export const adminClinicsQuerySchema = z.object({
  status: z.enum(CLINIC_STATUSES).optional(),
  q: z.string().trim().max(100, "Søgningen må højst være 100 tegn.").optional(),
});

// POST /api/admin/clinics/{id}/status: kun "Verificér" (verified) og "Sæt på pause" (registered).
export const adminClinicStatusSchema = z.object({ status: z.enum(["verified", "registered"]), reason: reason.optional() }).strict();

// GET /api/admin/moderation?kind=&status=
export const adminModerationQuerySchema = z.object({
  kind: z.enum(MODERATION_KINDS).default("review"),
  status: z.enum(MODERATION_STATUSES).default("pending"),
});

// POST /api/admin/moderation/{kind}/{id}. Afvisning kræver en begrundelse: en tom eller manglende giver 400 REASON_REQUIRED (controlleren og databasen).
export const adminModerateSchema = z.object({ status: z.enum(["approved", "rejected"]), reason: reason.optional() }).strict();

// Stien: kind er review eller reply.
export const adminModerationKindSchema = z.enum(MODERATION_KINDS);
