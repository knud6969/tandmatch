import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Linking } from "react-native";
import { registerPushToken, deletePushToken } from "~/api/push-tokens";
import { clearPushToken, getPushFlag, getPushToken, savePushToken, setPushFlag } from "~/auth/tokens";
import type { PushPermission } from "~/utils/push-prompt";

// Appens lag til push (mobile 13.10): tilladelse, token og registrering. Fejl vises aldrig for patienten og logger aldrig tokens.

// I forgrunden vises banneret uden lyd.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

// Sættes af `eas init`. Uden projekt-id skjuler appen alle notifikationsvalg.
export function pushProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

export async function getPushPermission(): Promise<PushPermission> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
}

export async function requestPushPermission(): Promise<PushPermission> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
}

// Tilladelse givet: hent tokenet og registrer det. Returnerer true, hvis tokenet er registreret.
export async function registerForPush(): Promise<boolean> {
  try {
    const projectId = pushProjectId();
    if (!projectId || (await getPushPermission()) !== "granted") return false;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await registerPushToken(token);
    await savePushToken(token);
    await setPushFlag("disabled", false);
    return true;
  } catch {
    return false;
  }
}

// Ved app-start for en patient med konto: tokenet kan skifte, og `last_seen_at` opdateres. Efter "Modtag notifikationer" slået fra
// registreres der ikke; ligger tokenet stadig lokalt (afmeldingen mislykkedes), forsøges afmeldingen igen.
export async function registerOnStart(): Promise<void> {
  if (await getPushFlag("disabled")) {
    await unregisterStoredToken();
    return;
  }
  await registerForPush();
}

// Afmelder det gemte token. Det slettes lokalt først, når serveren har afmeldt det (security L3); ellers beholdes det, så
// afmeldingen kan gentages. Returnerer true, når der intet token er tilbage.
async function unregisterStoredToken(): Promise<boolean> {
  try {
    const token = await getPushToken();
    if (token) {
      await deletePushToken(token);
      await clearPushToken();
    }
    return true;
  } catch {
    return false;
  }
}

// Kontakten "Modtag notifikationer" slået fra: afmeld tokenet og husk valget. Mislykkes afmeldingen, beholdes tokenet lokalt, og
// den forsøges igen ved næste start og ved logud.
export async function disablePush(): Promise<void> {
  await setPushFlag("disabled", true);
  await unregisterStoredToken();
}

export const dismissPushPrompt = () => setPushFlag("dismissed", true);
export const isPushPromptDismissed = () => getPushFlag("dismissed");
export const isPushDisabled = () => getPushFlag("disabled");
export const openPhoneSettings = () => Linking.openSettings();
