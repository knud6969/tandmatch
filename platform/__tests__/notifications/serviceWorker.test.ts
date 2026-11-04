import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { isAllowedClinicNotificationPath } from "@/lib/common/domain/notifications";

// public/sw.js kan ikke importere TypeScript og spejler derfor reglen for stier. Testen sikrer, at de to er enige.
const source = readFileSync(path.resolve(import.meta.dirname, "../../../public/sw.js"), "utf8");
const context: Record<string, unknown> = { self: { addEventListener: () => undefined } };
vm.createContext(context);
vm.runInContext(source, context);
const swAllows = context.isAllowedClinicPath as (p: unknown) => boolean;

const ID = "3f2b8c1e-9a4d-4e7b-8c55-0a1b2c3d4e5f";
const SAMPLES: unknown[] = [
  `/klinik/lead/${ID}`,
  `/klinik/lead/${ID.toUpperCase()}`,
  "/klinik/kalender",
  "/klinik",
  "/klinik/lead/ikke-et-id",
  `/klinik/lead/${ID}/`,
  `/klinik/lead/${ID}?x=1`,
  `/klinik/lead/${ID}#a`,
  "/klinik/kalender/",
  "/klinik/profil",
  "//evil.example/klinik/kalender",
  "https://evil.example/klinik/kalender",
  `/sag/${ID}`,
  "/bookinger",
  `/klinik/lead/${ID}`.padEnd(250, "a"),
  "",
  null,
  undefined,
  42,
];

describe("service worker og lib er enige om klinikkens notifikationsstier", () => {
  it.each(SAMPLES.map((p) => [String(p).slice(0, 60), p]))("%s", (_name, p) => {
    expect(swAllows(p)).toBe(isAllowedClinicNotificationPath(p));
  });

  it("godkender henvendelsen og kalenderen", () => {
    expect(swAllows(`/klinik/lead/${ID}`)).toBe(true);
    expect(swAllows("/klinik/kalender")).toBe(true);
    expect(swAllows("/klinik/profil")).toBe(false);
  });
});
