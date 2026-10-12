import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anonymousExpiresAt } from "@/lib/constants/sessions";
import type { MeDto } from "@/lib/types/auth";
import type { Session } from "@/middleware/session";
import { PatientsRepository } from "@/models/patientsRepository";

// Den indloggede bruger: rolle og visningsnavn (architecture 10.2). Klinikkens navn tilføjes i 1.1.
export type MeDeps = { patients: PatientsRepository };

export class MeController {
  private readonly patients: PatientsRepository;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
    deps: Partial<MeDeps> = {},
  ) {
    this.patients = deps.patients ?? new PatientsRepository(supabase);
  }

  async get(): Promise<MeDto> {
    const displayName =
      this.session.role === "patient" ? ((await this.patients.findById(this.session.userId))?.firstName ?? null) : null;

    return {
      id: this.session.userId,
      role: this.session.role,
      isAnonymous: this.session.isAnonymous,
      displayName,
      anonymousExpiresAt: this.session.isAnonymous ? anonymousExpiresAt(this.session.lastActiveAt) : null,
    };
  }
}
