import { apiRequest } from "./client";

// Push-tokens (identity 10.15). Kun patienter med konto registrerer; afmelding er idempotent.
export async function registerPushToken(token: string): Promise<void> {
  await apiRequest("/api/push-tokens", { method: "PUT", json: { token, platform: "ios" } });
}

export async function deletePushToken(token: string): Promise<void> {
  await apiRequest("/api/push-tokens", { method: "DELETE", json: { token } });
}
