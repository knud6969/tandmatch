import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anonymousExpiresAt } from "@/lib/constants/sessions";
import type { MeDto } from "@/lib/types/auth";
import type { Session } from "@/middleware/session";
import { PatientsRepository } from "@/models/patientsRepository";
import { ProfilesRepository } from "@/models/profilesRepository";

// Den indloggede bruger: rolle og visningsnavn (architecture 10.2). For en klinik følger id, navn og status.
export type MeDeps = { patients: PatientsRepository; profiles: ProfilesRepository };

export class MeController {
  private readonly patients: PatientsRepository;
  private readonly profiles: ProfilesRepository;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
    deps: Partial<MeDeps> = {},
  ) {
    this.patients = deps.patients ?? new PatientsRepository(supabase);
    this.profiles = deps.profiles ?? new ProfilesRepository(supabase);
  }

  async get(): Promise<MeDto> {
    const displayName =
      this.session.role === "patient" ? ((await this.patients.findById(this.session.userId))?.firstName ?? null) : null;

    const clinic = this.session.role === "clinic" ? await this.profiles.findClinicSummary(this.session.userId) : null;

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
