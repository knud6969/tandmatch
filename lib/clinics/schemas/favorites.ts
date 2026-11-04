import { z } from "zod";

// PUT/DELETE /api/favorites/{clinicId}: stien skal være et klinik-id (400 VALIDATION_ERROR ellers).
export const favoriteClinicParamsSchema = z.object({ clinicId: z.uuid("Ugyldigt klinik-id.") }).strict();
