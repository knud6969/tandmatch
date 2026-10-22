import "server-only";
import { redirect } from "next/navigation";
import { createAuthContext, getSession, requireRole } from "@/platform/middleware/session";
import { ApiError } from "@/platform/middleware/http";
import { AREA_HOME } from "@/lib/common/navigation/areas";
import type { Role } from "@/lib/common/types/common";

// Server-side områdevagt (architecture 6.5). Kaldes i område-layouts før noget indhold rendres.
// Bruger requireRole() fra middleware/session.ts og oversætter fejlkoden til en redirect.
// Patienter har intet område på weben (de bruger appen, architecture 13.6) og sendes til forsiden.
export async function guardArea(role: Role, area: string): Promise<void> {
  const ctx = await createAuthContext(); // én opslag hos Supabase Auth pr. vagt
  try {
    await requireRole(role, { ctx });
    return;
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;

    if (error.code === "UNAUTHENTICATED") {
      redirect(`/login?naeste=${encodeURIComponent(area)}`);
    }
    if (error.code === "ANONYMOUS_NOT_ALLOWED") {
      redirect("/");
    }
    if (error.code === "FORBIDDEN") {
      // Forkert rolle: klinikker til deres område, alle andre til forsiden.
      const session = await getSession(ctx);
      redirect(session?.role === "clinic" ? AREA_HOME.clinic : session ? "/" : "/login");
    }
    throw error;
  }
}
