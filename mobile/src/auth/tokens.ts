import * as SecureStore from "expo-secure-store";
import type { MobileSessionDto } from "@/lib/identity/types/auth";
import { clearTermsToken, getTermsToken, saveTermsToken } from "./terms";

// Opbevaring af tokens i SecureStore (architecture 13.3) [PROTOTYPE, 0.1]. Intet i AsyncStorage.
const ACCESS_KEY = "tm.accessToken";
const REFRESH_KEY = "tm.refreshToken";
const EXPIRES_KEY = "tm.expiresAt";

// Vilkårstokenet re-eksporteres, så ~/api kun behøver at importere fra ~/auth/tokens (lagregel i eslint.config.mjs).
export { clearTermsToken, getTermsToken, saveTermsToken };

export type StoredSession = { accessToken: string; refreshToken: string; expiresAt: number };

// Tokens ligger i SecureStore (Keychain/Keystore), så de er krypteret og ikke læsbare for andre apps. Appen bruger aldrig cookies.
// Et ulæseligt udløbstidspunkt giver 0, så tokenet fornyes ved næste kald.
export async function getSession(): Promise<StoredSession | null> {
  const [accessToken, refreshToken, expires] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
    SecureStore.getItemAsync(EXPIRES_KEY),
  ]);
  if (!accessToken || !refreshToken) return null;
  const expiresAt = Date.parse(expires ?? "");
  return { accessToken, refreshToken, expiresAt: Number.isNaN(expiresAt) ? 0 : expiresAt };
}

// Gemmer alle tre værdier og melder ændringen, så SessionProvider henter /api/me igen.
export async function saveSession(session: MobileSessionDto): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, session.accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, session.refreshToken),
    SecureStore.setItemAsync(EXPIRES_KEY, session.expiresAt),
  ]);
  notifyAuthChange();
}

// Sletter sessionen lokalt (logud, afvist fornyelse eller klinik-konto).
export async function clearSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
    SecureStore.deleteItemAsync(EXPIRES_KEY),
  ]);
  notifyAuthChange();
}

// Lille abonnement, så SessionProvider opdateres, når klienten fornyer, logger ud eller mister vilkårstokenet.
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeAuthChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyAuthChange(): void {
  listeners.forEach((listener) => listener());
}
