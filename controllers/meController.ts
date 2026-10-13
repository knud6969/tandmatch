import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anonymousExpiresAt } from "@/lib/constants/sessions";
import type { MeDto } from "@/lib/types/auth";
import type { Session } from "@/middleware/session";
import { PatientsRepository } from "@/models/patientsRepository";
import { ClinicsRepository } from "@/models/clinicsRepository";

// Den indloggede bruger: rolle og visningsnavn (architecture 10.2). For en klinik følger id, navn og status.
export type MeDeps = { patients: PatientsRepository; clinics: ClinicsRepository };

export class MeController {
  private readonly patients: PatientsRepository;
  private readonly clinics: ClinicsRepository;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
    deps: Partial<MeDeps> = {},
  ) {
    this.patients = deps.patients ?? new PatientsRepository(supabase);
    this.clinics = deps.clinics ?? new ClinicsRepository(supabase);
  }

  async get(): Promise<MeDto> {
    const displayName =
      this.session.role === "patient" ? ((await this.patients.findById(this.session.userId))?.firstName ?? null) : null;

    const own = this.session.role === "clinic" ? await this.clinics.findOwn(this.session.userId) : null;
    const clinic = own ? { id: own.id, name: own.name, status: own.status } : null;

    return {
      id: this.session.userId,
      role: this.session.role,
      isAnonymous: this.session.isAnonymous,
      displayName,
      anonymousExpiresAt: this.session.isAnonymous ? anonymousExpiresAt(this.session.lastActiveAt) : null,
      ...(clinic ? { clinic } : {}),
    };
  }
}
