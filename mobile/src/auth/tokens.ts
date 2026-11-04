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

// Gemmer alle tre værdier og melder ændringen, så SessionProvider henter /api/me igen. Med `settle` venter kaldet, til
// SessionProvider har hentet /api/me, så skærmen efter login/opret/convert aldrig ser den gamle status. Fornyelse i klienten
// bruger ikke `settle` (den kører selv inde i en hentning af /api/me).
export async function saveSession(session: MobileSessionDto, options: { settle?: boolean } = {}): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, session.accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, session.refreshToken),
    SecureStore.setItemAsync(EXPIRES_KEY, session.expiresAt),
  ]);
  const settled = notifyAuthChange();
  if (options.settle) await settled;
}

// Sletter sessionen lokalt (logud, afvist fornyelse eller klinik-konto).
export async function clearSession(options: { settle?: boolean } = {}): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
    SecureStore.deleteItemAsync(EXPIRES_KEY),
  ]);
  const settled = notifyAuthChange();
  if (options.settle) await settled;
}

// Lille abonnement, så SessionProvider opdateres, når klienten fornyer, logger ud eller mister vilkårstokenet.
type Listener = () => void | Promise<void>;
const listeners = new Set<Listener>();

export function subscribeAuthChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Returnerer et løfte, der er færdigt, når alle lyttere (SessionProvider) har opdateret deres tilstand.
export function notifyAuthChange(): Promise<void> {
  return Promise.all([...listeners].map((listener) => listener())).then(() => undefined);
}

// Push (mobile 13.10): det senest registrerede token (så logud kan afmelde det), om patienten har valgt "Ikke nu" til kortet,
// og om patienten har slået notifikationer fra i Konto (så app-start ikke registrerer igen). Samme sted som sessionens tokens.
const PUSH_TOKEN_KEY = "tm.pushToken";
const PUSH_PROMPT_DISMISSED_KEY = "tm.pushPromptDismissed";
const PUSH_DISABLED_KEY = "tm.pushDisabled";

export const getPushToken = () => SecureStore.getItemAsync(PUSH_TOKEN_KEY);
export const savePushToken = (token: string) => SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
export const clearPushToken = () => SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);

export async function getPushFlag(flag: "dismissed" | "disabled"): Promise<boolean> {
  return (await SecureStore.getItemAsync(flag === "dismissed" ? PUSH_PROMPT_DISMISSED_KEY : PUSH_DISABLED_KEY)) === "1";
}

export async function setPushFlag(flag: "dismissed" | "disabled", value: boolean): Promise<void> {
  const key = flag === "dismissed" ? PUSH_PROMPT_DISMISSED_KEY : PUSH_DISABLED_KEY;
  if (value) await SecureStore.setItemAsync(key, "1");
  else await SecureStore.deleteItemAsync(key);
}
