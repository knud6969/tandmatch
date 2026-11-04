import { useCallback, useEffect, useState } from "react";
import {
  disablePush,
  dismissPushPrompt,
  getPushPermission,
  isPushDisabled,
  isPushPromptDismissed,
  openPhoneSettings,
  pushProjectId,
  registerForPush,
  requestPushPermission,
} from "~/notifications/push";
import type { PushPermission } from "~/utils/push-prompt";

// Tilstanden for notifikationer til skærmene (mobile 13.10): tilladelse, om patienten har valgt "Ikke nu" eller slået fra.
export function usePush() {
  const hasProjectId = pushProjectId() !== null;
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [disabled, setDisabled] = useState(false);

  const refresh = useCallback(async () => {
    if (!hasProjectId) return;
    const [p, d, off] = await Promise.all([getPushPermission(), isPushPromptDismissed(), isPushDisabled()]);
    setPermission(p);
    setDismissed(d);
    setDisabled(off);
  }, [hasProjectId]);

  useEffect(() => {
    // Læser telefonens tilladelse og de gemte valg ved visning.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  // Beder om tilladelse (iOS-dialogen) og registrerer tokenet ved ja.
  const enable = useCallback(async () => {
    const result = await requestPushPermission();
    setPermission(result);
    if (result === "granted") await registerForPush();
    await refresh();
  }, [refresh]);

  const dismiss = useCallback(async () => {
    await dismissPushPrompt();
    setDismissed(true);
  }, []);

  // Kontakten i Konto: til = registrer, fra = afmeld.
  const setReceiving = useCallback(
    async (on: boolean) => {
      if (on) await registerForPush();
      else await disablePush();
      await refresh();
    },
    [refresh],
  );

  return { hasProjectId, permission, dismissed, receiving: permission === "granted" && !disabled, enable, dismiss, setReceiving, openSettings: openPhoneSettings };
}
