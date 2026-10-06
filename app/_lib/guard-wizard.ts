import "server-only";
import { redirect } from "next/navigation";
import { getSession, requireRole } from "@/server/auth/session";
import { ApiError } from "@/server/http/api";
import { AREA_HOME } from "@/lib/navigation/areas";

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
