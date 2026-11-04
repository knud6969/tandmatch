import { NOTIFICATION_FALLBACK_PATH, notificationTarget, planNotificationNavigation } from "~/utils/notification-routing";

const ID = "3f2b8c1e-9a4d-4e7b-8c55-0a1b2c3d4e5f";
const LEAD = "7a1b8c1e-9a4d-4e7b-8c55-0a1b2c3d4e5f";

describe("notificationTarget", () => {
  it("åbner de tilladte stier", () => {
    expect(notificationTarget({ path: `/sag/${ID}` })).toBe(`/sag/${ID}`);
    expect(notificationTarget({ path: `/sag/${ID}/beskeder/${LEAD}` })).toBe(`/sag/${ID}/beskeder/${LEAD}`);
    expect(notificationTarget({ path: "/bookinger" })).toBe("/bookinger");
  });

  it("sender alt andet til Mine sager", () => {
    const bad: unknown[] = [
      { path: "/login" },
      { path: "/klinik/kalender" },
      { path: `/sag/${ID}?x=1` },
      { path: "https://evil.example/bookinger" },
      { path: "//evil.example" },
      { path: `/sag/${ID}/../login` },
      { path: 42 },
      {},
      null,
      undefined,
      "/bookinger",
    ];
    for (const data of bad) expect(notificationTarget(data)).toBe(NOTIFICATION_FALLBACK_PATH);
  });
});

describe("planNotificationNavigation", () => {
  it("åbner stien straks, når patienten er logget ind", () => {
    expect(planNotificationNavigation({ tapped: "/bookinger", pending: null, signedIn: true })).toEqual({ navigate: "/bookinger", pending: null });
  });

  it("gemmer stien, når patienten ikke er logget ind, og åbner den efter login", () => {
    const first = planNotificationNavigation({ tapped: "/bookinger", pending: null, signedIn: false });
    expect(first).toEqual({ navigate: null, pending: "/bookinger" });
    expect(planNotificationNavigation({ tapped: null, pending: first.pending, signedIn: false })).toEqual({ navigate: null, pending: "/bookinger" });
    expect(planNotificationNavigation({ tapped: null, pending: first.pending, signedIn: true })).toEqual({ navigate: "/bookinger", pending: null });
  });

  it("gør intet uden tryk og uden gemt sti", () => {
    expect(planNotificationNavigation({ tapped: null, pending: null, signedIn: true })).toEqual({ navigate: null, pending: null });
  });
});
