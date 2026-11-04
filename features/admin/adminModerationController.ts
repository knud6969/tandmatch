import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { adminModerateSchema, adminModerationQuerySchema } from "@/lib/admin/schemas/admin";
import type { AdminModerationItemDto, ModerationKind } from "@/lib/admin/types/admin";
import { forbidden, reasonRequired } from "@/platform/middleware/http";
import type { Session } from "@/platform/middleware/session";
import { AdminModerationRepository } from "@/features/admin/adminModerationRepository";

type ModerationQuery = z.infer<typeof adminModerationQuerySchema>;
type ModerateInput = z.infer<typeof adminModerateSchema>;

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type AdminModerationDeps = { moderation: AdminModerationRepository };

// Admins moderation af anmeldelser og klinikkers svar (admin 10.14, booking 8.5). Rollen er tjekket af routen; databasefunktionen
// tjekker den igen og skriver loggen (admin_actions).
export class AdminModerationController {
  private readonly moderation: AdminModerationRepository;

  constructor(supabase: SupabaseClient, session: Session, deps: Partial<AdminModerationDeps> = {}) {
    if (session.role !== "admin") throw forbidden();
    this.moderation = deps.moderation ?? new AdminModerationRepository(supabase);
  }

  async list(query: ModerationQuery): Promise<{ items: AdminModerationItemDto[] }> {
    return { items: await this.moderation.list(query.kind, query.status) };
  }

  // Godkend eller afvis. En afvisning kræver en begrundelse (400 REASON_REQUIRED). 404 for ukendt id.
  async moderate(kind: ModerationKind, id: string, input: ModerateInput): Promise<AdminModerationItemDto> {
    const reason = input.reason?.trim() || null;
    if (input.status === "rejected" && !reason) throw reasonRequired();
    await this.moderation.moderate(kind, id, input.status, reason);
    return this.moderation.require(kind, id);
  }
}
