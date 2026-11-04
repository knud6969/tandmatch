// Service worker til web push på klinik-weben (clinics 10.19, platform 14.2). Viser kun den korte tekst fra serveren
// og åbner kun de stier, som lib/common/domain/notifications.ts (isAllowedClinicNotificationPath) også godkender.
// En service worker kan ikke importere TypeScript, så reglen er spejlet her; platform/__tests__/notifications/serviceWorker.test.ts
// sikrer, at de to er enige.
const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const CLINIC_PATHS = [new RegExp("^/klinik/lead/" + UUID + "$"), /^\/klinik\/kalender$/];
const FALLBACK_PATH = "/klinik";
const FALLBACK_TITLE = "TandMatch";
const FALLBACK_BODY = "Du har en ny notifikation på TandMatch.";

function isAllowedClinicPath(path) {
  return typeof path === "string" && path.length <= 200 && CLINIC_PATHS.some(function (re) { return re.test(path); });
}

function text(value, fallback, max) {
  return typeof value === "string" && value.trim() !== "" ? value.slice(0, max) : fallback;
}

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", function (event) {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const path = isAllowedClinicPath(payload && payload.path) ? payload.path : FALLBACK_PATH;
  // Browsere kræver, at en push altid ender i en synlig notifikation.
  event.waitUntil(
    self.registration.showNotification(text(payload && payload.title, FALLBACK_TITLE, 100), {
      body: text(payload && payload.body, FALLBACK_BODY, 200),
      data: { path: path },
      tag: typeof (payload && payload.type) === "string" ? payload.type.slice(0, 60) : undefined,
    }),
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const stored = event.notification.data && event.notification.data.path;
  const path = isAllowedClinicPath(stored) ? stored : FALLBACK_PATH;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windows) {
      const target = new URL(path, self.location.origin).href;
      const same = windows.find(function (w) { return w.url === target; });
      if (same) return same.focus();
      const open = windows.find(function (w) { return new URL(w.url).origin === self.location.origin && "navigate" in w; });
      if (open) return open.navigate(target).then(function (w) { return (w || open).focus(); });
      return self.clients.openWindow(target);
    }),
  );
});
