import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RegisterPushTokenInput } from "@/lib/identity/types/push-tokens";
import type { Session } from "@/platform/middleware/session";
import { PushTokensRepository } from "@/features/identity/pushTokensRepository";

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type PushTokensDeps = { tokens: PushTokensRepository };

// Patientens push-tokens (identity 10.15). Routen har afvist anonyme og andre roller; databasen tjekker det igen.
export class PushTokensController {
  private readonly tokens: PushTokensRepository;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
    deps: Partial<PushTokensDeps> = {},
  ) {
    this.tokens = deps.tokens ?? new PushTokensRepository(supabase);
  }

  register(input: RegisterPushTokenInput): Promise<void> {
    return this.tokens.register(input);
  }

  // Afmelding ved logout: sletter kun brugerens eget token (RLS).
  remove(token: string): Promise<void> {
    return this.tokens.remove(token);
  }
}
