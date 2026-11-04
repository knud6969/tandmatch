"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { LoadState } from "@/components/ui/load-state";
import { SaveBar } from "@/components/ui/save-bar";
import { StatusMessage } from "@/components/ui/status-message";
import { useSaveState } from "@/features/clinics/utils/use-save-state";
import {
  NOTIFICATION_SETTINGS_TEXT as TEXT,
  NOTIFICATION_SETTING_HINT,
  NOTIFICATION_SETTING_LABEL,
  NOTIFICATION_SETTING_ROWS,
} from "@/lib/clinics/constants/notification-settings";
import type { ClinicNotificationSettingsDto } from "@/lib/clinics/types/notification-settings";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { useAction } from "@/platform/ui-utils/use-action";
import { useLoad } from "@/platform/ui-utils/use-load";
import {
  currentSubscription,
  pushSupport,
  subscribeBrowserPush,
  unsubscribeBrowserPush,
} from "@/platform/ui-utils/web-push-client";

const SETTINGS_URL = "/api/clinics/me/notification-settings";
const loadSettings = () =>
  apiRequest<ClinicNotificationSettingsDto>(SETTINGS_URL);

type BrowserState =
  "checking" | "unsupported" | "missing-key" | "denied" | "off" | "on";

// Sektionen "Notifikationer" på /klinik/profil (clinics 6.3, 10.19). Valgene gemmes for sig; browserens tilladelse
// bedes der kun om efter et klik.
export function NotificationSettings() {
  const { data, error, loading, reload } = useLoad(loadSettings);
  return (
    <Card id="notifikationer" className="flex scroll-mt-24 flex-col gap-5">
      <h2 className="text-xl font-semibold text-ink">{TEXT.title}</h2>
      {data ? (
        <Editor initial={data} />
      ) : (
        <LoadState loading={loading} error={error} onRetry={reload} />
      )}
    </Card>
  );
}

function Editor({ initial }: { initial: ClinicNotificationSettingsDto }) {
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState(initial);
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);
  const saveState = useSaveState(dirty);
  const browser = useBrowserPush();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveState.save(async () => {
      const next = await apiRequest<ClinicNotificationSettingsDto>(
        SETTINGS_URL,
        { method: "PUT", body: values },
      );
      setSaved(next);
      setValues(next);
    });
  }

  const browserOn = browser.state === "on";

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <p className="text-base text-ink-muted">{TEXT.intro}</p>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-lg font-semibold text-ink">
          {TEXT.emailGroup}
        </legend>
        {NOTIFICATION_SETTING_ROWS.map((row) => (
          <CheckboxField
            key={row.email}
            name={row.email}
            label={NOTIFICATION_SETTING_LABEL[row.label]}
            description={
              row.label === "newMessage"
                ? NOTIFICATION_SETTING_HINT.newMessage
                : undefined
            }
            checked={values[row.email]}
            selected={values[row.email]}
            onChange={(e) =>
              setValues((v) => ({ ...v, [row.email]: e.target.checked }))
            }
          />
        ))}
      </fieldset>

      <div className="flex flex-col gap-3">
        <h3 className="mb-1 text-lg font-semibold text-ink">
          {TEXT.browserGroup}
        </h3>
        <BrowserControl browser={browser} />
        <fieldset
          className="flex flex-col gap-3"
          disabled={!browserOn}
          aria-label={TEXT.browserGroup}
        >
          {NOTIFICATION_SETTING_ROWS.map((row) => (
            <CheckboxField
              key={row.webPush}
              name={row.webPush}
              label={NOTIFICATION_SETTING_LABEL[row.label]}
              description={
                row.label === "newMessage"
                  ? NOTIFICATION_SETTING_HINT.newMessage
                  : undefined
              }
              checked={values[row.webPush]}
              selected={browserOn && values[row.webPush]}
              disabled={!browserOn}
              onChange={(e) =>
                setValues((v) => ({ ...v, [row.webPush]: e.target.checked }))
              }
            />
          ))}
        </fieldset>
      </div>

      <SaveBar {...saveState.props} label={TEXT.save} sticky={false} />
    </form>
  );
}

function useBrowserPush() {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [state, setState] = useState<BrowserState>("checking");
  const action = useAction();

  useEffect(() => {
    let active = true;
    async function detect() {
      const support = pushSupport(vapidKey);
      if (support !== "supported") return support;
      if (Notification.permission === "denied") return "denied";
      const subscription =
        Notification.permission === "granted"
          ? await currentSubscription().catch(() => null)
          : null;
      return subscription ? "on" : "off";
    }
    void detect().then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, [vapidKey]);

  async function enable() {
    if (!vapidKey) return;
    await action.run(async () => {
      const result = await subscribeBrowserPush(vapidKey);
      setState(result === "subscribed" ? "on" : "denied");
      if (result === "subscribed") return TEXT.enabledDone;
    });
  }

  async function disable() {
    await action.run(async () => {
      await unsubscribeBrowserPush();
      setState("off");
      return TEXT.disabledDone;
    });
  }

  return { state, enable, disable, busy: action.busy, message: action.message };
}

function BrowserControl({
  browser,
}: {
  browser: ReturnType<typeof useBrowserPush>;
}) {
  const { state } = browser;
  const info: Partial<Record<BrowserState, string>> = {
    unsupported: TEXT.unsupported,
    "missing-key": TEXT.missingKey,
    denied: TEXT.denied,
    off: TEXT.browserOff,
    on: TEXT.browserOn,
  };
  return (
    <div className="flex flex-col items-start gap-3 rounded-control bg-brand-50 p-4">
      {info[state] && <p className="text-base text-ink">{info[state]}</p>}
      {(state === "off" || state === "denied") && (
        <Button type="button" onClick={browser.enable} disabled={browser.busy}>
          {TEXT.enable}
        </Button>
      )}
      {state === "on" && (
        <Button
          type="button"
          variant="secondary"
          onClick={browser.disable}
          disabled={browser.busy}
        >
          {TEXT.disable}
        </Button>
      )}
      <StatusMessage message={browser.message} />
    </div>
  );
}
