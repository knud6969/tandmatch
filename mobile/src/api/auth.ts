import { apiRequest } from "./client";
import { clearSession } from "~/auth/tokens";

// Log ud: kaldet tilbagekalder tokenet på serveren; tokens slettes lokalt, også hvis kaldet fejler (architecture 13.3).
export async function logout(): Promise<void> {
  try {
    await apiRequest("/api/auth/logout", { method: "POST" });
  } finally {
    await clearSession();
  }
}
