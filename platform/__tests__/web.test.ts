import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { requireWebClient, siteOrigin } = await import("@/platform/middleware/web");

describe("siteOrigin", () => {
  const req = new Request("http://127.0.0.1:3101/api/auth/password/forgot", { method: "POST" });

  it("bruger SITE_URL, når den er sat (kun origin, ingen sti)", () => {
    expect(siteOrigin(req, "https://tandmatch.example/noget")).toBe("https://tandmatch.example");
  });
  it("bruger ellers requestens egen origin", () => {
    expect(siteOrigin(req, undefined)).toBe("http://127.0.0.1:3101");
    expect(siteOrigin(req, "  ")).toBe("http://127.0.0.1:3101");
  });
  it("afviser andet end http(s)", () => {
    expect(() => siteOrigin(req, "javascript:alert(1)")).toThrow();
  });
});

describe("requireWebClient", () => {
  it("afviser appen (bearer eller klientheader) og tillader cookies", () => {
    expect(() => requireWebClient(new Request("http://a/", { headers: { "X-TandMatch-Client": "mobile" } }))).toThrow();
    expect(() => requireWebClient(new Request("http://a/", { headers: { Authorization: "Bearer x" } }))).toThrow();
    expect(() => requireWebClient(new Request("http://a/"))).not.toThrow();
  });
});
