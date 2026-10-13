import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { servicesQuerySchema } from "@/lib/schemas/services";
import type { ServiceDto } from "@/lib/types/services";
import type { Session } from "@/middleware/session";
import { ServicesRepository } from "@/models/servicesRepository";

type ServicesQuery = z.infer<typeof servicesQuerySchema>;

export type ServicesDeps = { services: ServicesRepository };

// Ydelseskataloget (architecture 10.4). Åbent for alle, også uden session; kataloget er offentlig referencedata.
export class ServicesController {
  private readonly services: ServicesRepository;

  constructor(
    supabase: SupabaseClient,
    // Sessionen bruges ikke (kataloget er det samme for alle), men gives for ens signatur (architecture 2.1.1).
    _session: Session | null,
    deps: Partial<ServicesDeps> = {},
  ) {
    this.services = deps.services ?? new ServicesRepository(supabase);
  }

  list(query: ServicesQuery): Promise<ServiceDto[]> {
    return this.services.listActive(query.category);
  }
}
