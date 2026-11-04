import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { adminClinicStatusSchema, adminClinicsQuerySchema } from "@/lib/admin/schemas/admin";
import type { AdminClinicDto } from "@/lib/admin/types/admin";
import { forbidden } from "@/platform/middleware/http";
import type { Session } from "@/platform/middleware/session";
import { AdminClinicsRepository } from "@/features/admin/adminClinicsRepository";

type ClinicsQuery = z.infer<typeof adminClinicsQuerySchema>;
type StatusInput = z.infer<typeof adminClinicStatusSchema>;

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type AdminClinicsDeps = { clinics: AdminClinicsRepository };

// Admins klinikliste og statusændring (admin 10.14). Rollen er tjekket af routen; databasefunktionen tjekker den igen.
export class AdminClinicsController {
  private readonly clinics: AdminClinicsRepository;

  constructor(supabase: SupabaseClient, session: Session, deps: Partial<AdminClinicsDeps> = {}) {
    if (session.role !== "admin") throw forbidden();
    this.clinics = deps.clinics ?? new AdminClinicsRepository(supabase);
  }

  async list(query: ClinicsQuery): Promise<{ clinics: AdminClinicDto[] }> {
    return { clinics: await this.clinics.list(query) };
  }

  // "Verificér" (registered -> verified) og "Sæt på pause" (verified -> registered). 404; 409 INVALID_STATUS_TRANSITION.
  async changeStatus(clinicId: string, input: StatusInput): Promise<AdminClinicDto> {
    await this.clinics.changeStatus(clinicId, input.status, input.reason?.trim() || null);
    return this.clinics.require(clinicId);
  }
}
