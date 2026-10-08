import "server-only";
import { redirect } from "next/navigation";
import { getSession, requireRole } from "@/middleware/session";
import { ApiError } from "@/middleware/http";
import { AREA_HOME } from "@/lib/navigation/areas";
import type { Role } from "@/lib/types/common";

// Server-side områdevagt (architecture 6.5). Kaldes i område-layouts før noget indhold rendres.
// Bruger requireRole() fra middleware/session.ts og oversætter fejlkoden til en redirect.
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

// Områdevagt for /start/[requestId] (architecture 6.1, 6.5). Anonyme patienter er tilladt her, fordi det er deres kladde.
// Ejerskab af forespørgslen tjekkes af API'et (404 for andres), ikke her, så serveren ikke henter forretningsdata.
export async function guardWizard(): Promise<void> {
  try {
    await requireRole("patient", { allowAnonymous: true });
    return;
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;

    if (error.code === "UNAUTHENTICATED") {
      // Uden session har der ingen kladde. Brugeren starter forfra på /start.
      redirect("/start");
    }
    if (error.code === "FORBIDDEN") {
      const session = await getSession();
      redirect(session ? AREA_HOME[session.role] : "/login");
    }
    throw error;
  }
}
