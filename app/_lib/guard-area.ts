import "server-only";
import { redirect } from "next/navigation";
import { getSession, requireRole } from "@/server/auth/session";
import { ApiError } from "@/server/http/api";
import { AREA_HOME } from "@/lib/navigation/areas";
import type { Role } from "@/lib/types/common";

// Server-side områdevagt (architecture 6.5). Kaldes i område-layouts før noget indhold rendres.
// Bruger requireRole() fra server/auth/session.ts og oversætter fejlkoden til en redirect.
// Anonyme patienter sendes til /opret/patient, fordi alle /patient-sider kræver konto (undtagen wizarden, som ikke er bygget).
export async function guardArea(role: Role, area: string): Promise<void> {
  try {
    await requireRole(role);
    return;
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;

    if (error.code === "UNAUTHENTICATED") {
      redirect(`/login?naeste=${encodeURIComponent(area)}`);
    }
    if (error.code === "ANONYMOUS_NOT_ALLOWED") {
      redirect("/opret/patient");
    }
    if (error.code === "FORBIDDEN") {
      // Forkert rolle: send brugeren til sit eget område.
      const session = await getSession();
      redirect(session ? AREA_HOME[session.role] : "/login");
    }
    throw error;
  }
}
