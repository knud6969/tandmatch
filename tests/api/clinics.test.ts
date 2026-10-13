// API-tests for trin 1: klinik-signup, ydelseskatalog og egen klinik med profil, prisliste, åbningstider,
// blokeringer, logo, tandlæger, portefølje og sletning (architecture 10.2, 10.4, 10.8, 9.5).
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PASSWORD,
  TestClient,
  adminClient,
  imageForm,
  jpegWithExif,
  newClientWithTerms,
  randomCvr,
  uniqueEmail,
} from "./helpers.ts";

const admin = adminClient();
const createdUserIds = new Set<string>();
const PORTFOLIO_CONSENT_VERSION = "portfolio_consent@v0-prototype";

after(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id).catch(() => {});
});

type Signed = { c: TestClient; userId: string; cvr: string; clinicId: string };

function clinicBody(cvr: string, overrides: Record<string, unknown> = {}) {
  return {
    role: "clinic",
    email: uniqueEmail("klinik"),
    password: PASSWORD,
    cvr,
    clinicName: "Testklinikken ApS",
    address: "Testvej 1",
    postalCode: "2100",
    city: "København Ø",
    phone: "00 00 00 01",
    ...overrides,
  };
}

async function signupClinic(overrides: Record<string, unknown> = {}): Promise<Signed> {
  const cvr = randomCvr();
  const c = await newClientWithTerms();
  const r = await c.post("/api/auth/signup", clinicBody(cvr, overrides));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  createdUserIds.add(r.body.userId);
  const me = await c.get("/api/me");
  assert.equal(me.status, 200);
  return { c, userId: r.body.userId, cvr, clinicId: me.body.clinic.id };
}

async function patientClient() {
  const c = await newClientWithTerms();
  const r = await c.post("/api/auth/signup", { role: "patient", email: uniqueEmail(), password: PASSWORD, firstName: "Pia" });
  assert.equal(r.status, 201);
  createdUserIds.add(r.body.userId);
  return c;
}

type ServiceGroup = { id: string; slug: string; name: string; description: string; services: { id: string; slug: string; category: string; groupId: string; groupSlug: string }[] };

async function catalog(c: TestClient): Promise<ServiceGroup[]> {
  const r = await c.get("/api/services");
  assert.equal(r.status, 200);
  return r.body.groups;
}

// Vælger kategorien for de første behandlinger i kataloget (prisreglen kræver valgt kategori) og returnerer id'erne.
async function serviceIds(c: TestClient, count = 2): Promise<string[]> {
  const groups = await catalog(c);
  const services = groups.flatMap((g) => g.services).slice(0, count);
  const put = await c.put("/api/clinics/me/service-groups", { groupIds: [...new Set(services.map((s) => s.groupId))] });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  return services.map((s) => s.id);
}

describe("ydelseskatalog", () => {
  it("er offentligt, grupperet i kategorier og indeholder undersøgelse og en akutydelse", async () => {
    const c = await newClientWithTerms();
    const groups = await catalog(c);
    assert.ok(groups.length >= 14);
    const all = groups.flatMap((g) => g.services);
    assert.ok(all.length >= 53);
    assert.ok(all.some((s) => s.slug === "undersoegelse"));
    assert.ok(all.some((s) => s.category === "emergency"));
    for (const g of groups) {
      assert.deepEqual(Object.keys(g).sort(), ["description", "id", "name", "services", "slug"]);
      assert.ok(g.services.length > 0, "kategorier uden behandlinger udelades");
      for (const s of g.services) {
        assert.deepEqual(Object.keys(s).sort(), ["category", "defaultDurationMin", "description", "groupId", "groupSlug", "id", "name", "slug"]);
        assert.equal(s.groupId, g.id);
        assert.equal(s.groupSlug, g.slug);
      }
    }
    // Typen emergency hører præcis til kategorien akut.
    assert.ok(all.filter((s) => s.groupSlug === "akut").every((s) => s.category === "emergency"));
    assert.ok(all.filter((s) => s.groupSlug !== "akut").every((s) => s.category !== "emergency"));
    // Kategorierne følger sort_order: forebyggelse først, akut sidst.
    assert.equal(groups[0].slug, "forebyggelse");
    assert.equal(groups[groups.length - 1].slug, "akut");
  });

  it("kan filtreres på overordnet type, og ukendt type giver 400", async () => {
    const c = await newClientWithTerms();
    const r = await c.get("/api/services?category=cosmetic");
    assert.equal(r.status, 200);
    const services = r.body.groups.flatMap((g: ServiceGroup) => g.services);
    assert.ok(services.length > 0);
    assert.ok(services.every((s: { category: string }) => s.category === "cosmetic"));
    assert.ok(r.body.groups.every((g: ServiceGroup) => g.slug !== "akut"), "kategorier uden behandlinger efter filter udelades");
    assert.equal((await c.get("/api/services?category=andet")).status, 400);
  });

  it("skjuler inaktive behandlinger og kategorier", async () => {
    const c = await newClientWithTerms();
    const groups = await catalog(c);
    const group = groups.find((g) => g.slug === "bidskinner")!;
    const service = group.services[0];
    await admin.from("services").update({ is_active: false }).eq("id", service.id);
    try {
      const afterService = (await catalog(c)).find((g) => g.slug === "bidskinner")!;
      assert.equal(afterService.services.length, group.services.length - 1);
      await admin.from("service_groups").update({ is_active: false }).eq("id", group.id);
      assert.equal((await catalog(c)).some((g) => g.slug === "bidskinner"), false);
    } finally {
      await admin.from("service_groups").update({ is_active: true }).eq("id", group.id);
      await admin.from("services").update({ is_active: true }).eq("id", service.id);
    }
  });

  it("kræver vilkårs-accept", async () => {
    const r = await new TestClient().get("/api/services");
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, "TERMS_REQUIRED");
  });
});

describe("egen klinik: valgte kategorier", () => {
  it("PUT erstatter valget, GET læser det, og tomt valg er tilladt", async () => {
    const { c } = await signupClinic();
    const groups = await catalog(c);
    assert.deepEqual((await c.get("/api/clinics/me/service-groups")).body, { groupIds: [] });
    const two = [groups[2].id, groups[0].id];
    const put = await c.put("/api/clinics/me/service-groups", { groupIds: two });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    assert.deepEqual([...put.body.groupIds].sort(), [...two].sort());
    assert.deepEqual([...(await c.get("/api/clinics/me/service-groups")).body.groupIds].sort(), [...two].sort());
    const one = await c.put("/api/clinics/me/service-groups", { groupIds: [groups[1].id] });
    assert.deepEqual(one.body.groupIds, [groups[1].id]);
    assert.deepEqual((await c.put("/api/clinics/me/service-groups", { groupIds: [] })).body.groupIds, []);
  });

  it("afviser ukendte, inaktive, ugyldige og dublerede kategorier", async () => {
    const { c } = await signupClinic();
    const groups = await catalog(c);
    const unknown = await c.put("/api/clinics/me/service-groups", { groupIds: ["00000000-0000-4000-8000-000000000000"] });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error.code, "UNKNOWN_SERVICE_GROUP");
    for (const body of [{ groupIds: ["ikke-uuid"] }, { groupIds: [groups[0].id, groups[0].id] }, { groupIds: "x" }, { groupIds: [], extra: 1 }, {}]) {
      assert.equal((await c.put("/api/clinics/me/service-groups", body)).status, 400, JSON.stringify(body));
    }
    await admin.from("service_groups").update({ is_active: false }).eq("id", groups[3].id);
    try {
      assert.equal((await c.put("/api/clinics/me/service-groups", { groupIds: [groups[3].id] })).status, 400);
    } finally {
      await admin.from("service_groups").update({ is_active: true }).eq("id", groups[3].id);
    }
  });

  it("pris i en kategori, der ikke er valgt, giver 409 SERVICE_GROUP_NOT_SELECTED og ændrer intet", async () => {
    const { c } = await signupClinic();
    const groups = await catalog(c);
    const [a] = groups[0].services;
    const [other] = groups[1].services;
    await c.put("/api/clinics/me/service-groups", { groupIds: [groups[0].id] });
    const ok = await c.put("/api/clinics/me/prices", { prices: [{ serviceId: a.id, priceMin: 100, priceMax: 200, durationMin: 30 }] });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const bad = await c.put("/api/clinics/me/prices", {
      prices: [
        { serviceId: a.id, priceMin: 999, priceMax: 999, durationMin: 30 },
        { serviceId: other.id, priceMin: 100, priceMax: 200, durationMin: 30 },
      ],
    });
    assert.equal(bad.status, 409);
    assert.equal(bad.body.error.code, "SERVICE_GROUP_NOT_SELECTED");
    // Udskiftningen er atomar: den gamle liste er uændret.
    const after = (await c.get("/api/clinics/me/prices")).body.prices;
    assert.equal(after.length, 1);
    assert.deepEqual(after[0].price, { min: 100, max: 200 });
  });

  it("fravalg af en kategori sletter priserne i den, og kun dem", async () => {
    const { c } = await signupClinic();
    const groups = await catalog(c);
    const a = groups[0].services[0];
    const b = groups[1].services[0];
    await c.put("/api/clinics/me/service-groups", { groupIds: [groups[0].id, groups[1].id] });
    await c.put("/api/clinics/me/prices", {
      prices: [
        { serviceId: a.id, priceMin: 100, priceMax: 200, durationMin: 30 },
        { serviceId: b.id, priceMin: 300, priceMax: 400, durationMin: 30 },
      ],
    });
    await c.put("/api/clinics/me/service-groups", { groupIds: [groups[1].id] });
    const prices = (await c.get("/api/clinics/me/prices")).body.prices;
    assert.deepEqual(prices.map((p: { serviceId: string }) => p.serviceId), [b.id]);
  });

  it("er kun synligt for ejeren, og patienter får 403", async () => {
    const x = await signupClinic();
    const y = await signupClinic();
    const groups = await catalog(x.c);
    await x.c.put("/api/clinics/me/service-groups", { groupIds: [groups[0].id] });
    assert.deepEqual((await y.c.get("/api/clinics/me/service-groups")).body.groupIds, []);
    const p = await patientClient();
    assert.equal((await p.get("/api/clinics/me/service-groups")).status, 403);
    assert.equal((await p.put("/api/clinics/me/service-groups", { groupIds: [] })).status, 403);
    assert.equal((await (await newClientWithTerms()).get("/api/clinics/me/service-groups")).status, 401);
  });
});

describe("klinik-signup", () => {
  it("opretter klinik med status registered, og /api/me returnerer den", async () => {
    const { c, userId, cvr, clinicId } = await signupClinic();
    const me = await c.get("/api/me");
    assert.equal(me.body.id, userId);
    assert.equal(me.body.role, "clinic");
    assert.deepEqual(me.body.clinic, { id: clinicId, name: "Testklinikken ApS", status: "registered" });
    const own = await c.get("/api/clinics/me");
    assert.equal(own.status, 200);
    assert.equal(own.body.cvr, cvr);
    assert.equal(own.body.status, "registered");
    assert.equal(own.body.canReceiveLeads, false);
  });

  it("patienter får ingen clinic i /api/me", async () => {
    const c = await patientClient();
    const me = await c.get("/api/me");
    assert.equal(me.body.role, "patient");
    assert.equal("clinic" in me.body, false);
  });

  it("giver 409 CLINIC_EXISTS, når CVR'et har en ejer", async () => {
    const first = await signupClinic();
    const c = await newClientWithTerms();
    const r = await c.post("/api/auth/signup", clinicBody(first.cvr));
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, "CLINIC_EXISTS");
  });

  it("knytter kontoen til en importeret klinik med samme CVR", async () => {
    const cvr = randomCvr();
    const { data, error } = await admin
      .from("clinics")
      .insert({ status: "imported", cvr, name: "Importeret Tandklinik", address: "Gammelvej 2", postal_code: "8000", city: "Aarhus C", import_source: "seed" })
      .select("id")
      .single();
    assert.ifError(error);
    const importedId = data!.id as string;
    const c = await newClientWithTerms();
    const r = await c.post("/api/auth/signup", clinicBody(cvr, { clinicName: "Nyt navn" }));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    createdUserIds.add(r.body.userId);
    const me = await c.get("/api/me");
    assert.equal(me.body.clinic.id, importedId);
    assert.equal(me.body.clinic.status, "registered");
    assert.equal(me.body.clinic.name, "Importeret Tandklinik");
    await admin.from("clinics").delete().eq("id", importedId);
  });

  it("validerer input (CVR, telefon, postnummer, ukendte felter, rolle)", async () => {
    const c = await newClientWithTerms();
    const bad: Record<string, unknown>[] = [
      { cvr: "123" },
      { cvr: "1234567a" },
      { phone: "abc" },
      { postalCode: "12" },
      { clinicName: "A" },
      { password: "kort" },
      { status: "verified" },
    ];
    for (const overrides of bad) {
      const r = await c.post("/api/auth/signup", clinicBody(randomCvr(), overrides));
      assert.equal(r.status, 400, JSON.stringify(overrides));
    }
    const admin2 = await c.post("/api/auth/signup", { ...clinicBody(randomCvr()), role: "admin" });
    assert.equal(admin2.status, 400);
  });

  it("kan logge ind igen som klinik", async () => {
    const body = clinicBody(randomCvr());
    const c = await newClientWithTerms();
    const s = await c.post("/api/auth/signup", body);
    createdUserIds.add(s.body.userId);
    const fresh = await newClientWithTerms();
    const l = await fresh.post("/api/auth/login", { email: body.email, password: PASSWORD });
    assert.equal(l.status, 200);
    assert.equal(l.body.role, "clinic");
  });
});

describe("egen klinik: adgang", () => {
  it("kræver rollen clinic (401 uden session, 403 for patient)", async () => {
    const paths = ["/api/clinics/me", "/api/clinics/me/prices", "/api/clinics/me/opening-hours", "/api/clinics/me/time-blocks", "/api/clinics/me/dentists"];
    const anon = await newClientWithTerms();
    const patient = await patientClient();
    for (const path of paths) {
      assert.equal((await anon.get(path)).status, 401, path);
      assert.equal((await patient.get(path)).status, 403, path);
    }
  });

  it("kræver vilkårs-accept", async () => {
    assert.equal((await new TestClient().get("/api/clinics/me")).status, 403);
  });
});

describe("egen klinik: profil", () => {
  it("PATCH ændrer felter, og Trustpilot sætter enteredBy = clinic", async () => {
    const { c } = await signupClinic();
    const r = await c.patch("/api/clinics/me", {
      name: "Nyt Navn Tandklinik",
      description: "Vi er en lille klinik.",
      postalCode: "8000",
      city: "Aarhus C",
      email: "kontakt@example.test",
      website: "https://example.test",
      trustpilotUrl: "https://dk.trustpilot.com/review/example.test",
      trustpilotScore: 4.6,
      trustpilotReviewCount: 120,
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.name, "Nyt Navn Tandklinik");
    assert.equal(r.body.city, "Aarhus C");
    assert.equal(r.body.trustpilot.score, 4.6);
    assert.equal(r.body.trustpilot.reviewCount, 120);
    assert.equal(r.body.trustpilot.enteredBy, "clinic");
    assert.ok(r.body.trustpilot.updatedAt);
    assert.ok(r.body.location, "placering følger det nye postnummer");
    assert.equal(r.body.status, "registered");
  });

  it("kan ikke ændre status, CVR, ejer eller verificering (strict)", async () => {
    const { c, cvr } = await signupClinic();
    for (const body of [{ status: "verified" }, { cvr: "12345678" }, { ownerId: "x" }, { verifiedAt: "2026-01-01T00:00:00Z" }, { logoPath: "x" }]) {
      assert.equal((await c.patch("/api/clinics/me", body)).status, 400, JSON.stringify(body));
    }
    const own = await c.get("/api/clinics/me");
    assert.equal(own.body.status, "registered");
    assert.equal(own.body.cvr, cvr);
  });

  it("validerer Trustpilot-link, score og telefon", async () => {
    const { c } = await signupClinic();
    for (const body of [
      { trustpilotUrl: "https://example.com/review/x", trustpilotScore: 4 },
      { trustpilotUrl: "https://dk.trustpilot.com/review/x", trustpilotScore: 6 },
      { trustpilotUrl: "https://dk.trustpilot.com/review/x", trustpilotScore: 4.55 },
      { phone: "ikke et nummer" },
      { website: "javascript:alert(1)" },
      { postalCode: "abcd" },
    ]) {
      assert.equal((await c.patch("/api/clinics/me", body)).status, 400, JSON.stringify(body));
    }
    const noUrl = await c.patch("/api/clinics/me", { trustpilotScore: 4 });
    assert.equal(noUrl.status, 400);
    assert.equal(noUrl.body.error.code, "TRUSTPILOT_URL_REQUIRED");
  });

  it("kan rydde valgfrie felter, og Trustpilot kan fjernes", async () => {
    const { c } = await signupClinic();
    await c.patch("/api/clinics/me", { description: "Tekst", trustpilotUrl: "https://www.trustpilot.com/review/x", trustpilotScore: 3.5 });
    const r = await c.patch("/api/clinics/me", { description: "", trustpilotUrl: null, trustpilotScore: null, trustpilotReviewCount: null });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.description, null);
    assert.equal(r.body.trustpilot, null);
  });
});

describe("egen klinik: prisliste", () => {
  it("PUT erstatter hele listen, og GET læser den i katalogets rækkefølge", async () => {
    const { c } = await signupClinic();
    const [a, b] = await serviceIds(c, 2);
    const first = await c.put("/api/clinics/me/prices", {
      prices: [
        { serviceId: b, priceMin: 500, priceMax: 900, durationMin: 45, note: "inkl. røntgen" },
        { serviceId: a, priceMin: 300, priceMax: 300, durationMin: 30 },
      ],
    });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.prices.length, 2);
    assert.deepEqual(first.body.prices[0].price, { min: 300, max: 300 });
    assert.equal(first.body.prices[1].note, "inkl. røntgen");
    assert.ok(first.body.prices[0].serviceSlug && first.body.prices[0].serviceName);

    const second = await c.put("/api/clinics/me/prices", { prices: [{ serviceId: a, priceMin: 350, priceMax: 400, durationMin: 30 }] });
    assert.equal(second.body.prices.length, 1);
    assert.deepEqual(second.body.prices[0].price, { min: 350, max: 400 });
    assert.equal((await c.get("/api/clinics/me/prices")).body.prices.length, 1);
    assert.equal((await c.get("/api/clinics/me")).body.prices.length, 1);

    const empty = await c.put("/api/clinics/me/prices", { prices: [] });
    assert.deepEqual(empty.body.prices, []);
  });

  it("afviser ugyldige priser, dubletter og ukendte ydelser", async () => {
    const { c } = await signupClinic();
    const [a] = await serviceIds(c, 1);
    const bad: unknown[] = [
      { prices: [{ serviceId: a, priceMin: 500, priceMax: 100, durationMin: 30 }] },
      { prices: [{ serviceId: a, priceMin: -1, priceMax: 100, durationMin: 30 }] },
      { prices: [{ serviceId: a, priceMin: 1.5, priceMax: 100, durationMin: 30 }] },
      { prices: [{ serviceId: a, priceMin: 1, priceMax: 100, durationMin: 2 }] },
      { prices: [{ serviceId: a, priceMin: 1, priceMax: 100, durationMin: 600 }] },
      { prices: [{ serviceId: "ikke-uuid", priceMin: 1, priceMax: 100, durationMin: 30 }] },
      { prices: [{ serviceId: a, priceMin: 1, priceMax: 2, durationMin: 30 }, { serviceId: a, priceMin: 1, priceMax: 2, durationMin: 30 }] },
      { prices: [{ serviceId: a, priceMin: 1, priceMax: 2, durationMin: 30, extra: true }] },
    ];
    for (const body of bad) assert.equal((await c.put("/api/clinics/me/prices", body)).status, 400, JSON.stringify(body));
    const unknown = await c.put("/api/clinics/me/prices", {
      prices: [{ serviceId: "00000000-0000-4000-8000-000000000000", priceMin: 1, priceMax: 2, durationMin: 30 }],
    });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error.code, "UNKNOWN_SERVICE");
  });

  it("en klinik ser og ændrer aldrig en andens prisliste", async () => {
    const x = await signupClinic();
    const y = await signupClinic();
    const [a] = await serviceIds(x.c, 1);
    await x.c.put("/api/clinics/me/prices", { prices: [{ serviceId: a, priceMin: 100, priceMax: 200, durationMin: 30 }] });
    assert.deepEqual((await y.c.get("/api/clinics/me/prices")).body.prices, []);
    await y.c.put("/api/clinics/me/prices", { prices: [] });
    assert.equal((await x.c.get("/api/clinics/me/prices")).body.prices.length, 1);
  });
});

describe("egen klinik: åbningstider", () => {
  it("PUT erstatter hele listen og returnerer HH:MM sorteret", async () => {
    const { c } = await signupClinic();
    const r = await c.put("/api/clinics/me/opening-hours", {
      hours: [
        { weekday: 2, opensAt: "13:00", closesAt: "16:00", isEmergency: false },
        { weekday: 1, opensAt: "08:00", closesAt: "12:00", isEmergency: false },
        { weekday: 1, opensAt: "12:00", closesAt: "16:00", isEmergency: false },
        { weekday: 6, opensAt: "10:00", closesAt: "12:00", isEmergency: true },
      ],
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(
      r.body.hours.map((h: { weekday: number; opensAt: string }) => `${h.weekday} ${h.opensAt}`),
      ["1 08:00", "1 12:00", "2 13:00", "6 10:00"],
    );
    assert.equal(r.body.hours[3].isEmergency, true);
    assert.equal((await c.get("/api/clinics/me")).body.openingHours.length, 4);

    const replaced = await c.put("/api/clinics/me/opening-hours", {
      hours: [{ weekday: 3, opensAt: "09:00", closesAt: "15:30", isEmergency: false }],
    });
    assert.equal(replaced.body.hours.length, 1);
    assert.equal(replaced.body.hours[0].closesAt, "15:30");
  });

  it("afviser overlap, omvendte tider og ugyldige værdier uden at ændre listen", async () => {
    const { c } = await signupClinic();
    await c.put("/api/clinics/me/opening-hours", { hours: [{ weekday: 1, opensAt: "08:00", closesAt: "16:00", isEmergency: false }] });
    const bad: unknown[] = [
      { hours: [{ weekday: 1, opensAt: "08:00", closesAt: "12:00", isEmergency: false }, { weekday: 1, opensAt: "11:00", closesAt: "14:00", isEmergency: true }] },
      { hours: [{ weekday: 1, opensAt: "12:00", closesAt: "08:00", isEmergency: false }] },
      { hours: [{ weekday: 1, opensAt: "09:00", closesAt: "09:00", isEmergency: false }] },
      { hours: [{ weekday: 8, opensAt: "08:00", closesAt: "12:00", isEmergency: false }] },
      { hours: [{ weekday: 1, opensAt: "8:00", closesAt: "12:00", isEmergency: false }] },
      { hours: [{ weekday: 1, opensAt: "08:00", closesAt: "24:00", isEmergency: false }] },
      { hours: [{ weekday: 1, opensAt: "08:00", closesAt: "12:00" }] },
    ];
    for (const body of bad) assert.equal((await c.put("/api/clinics/me/opening-hours", body)).status, 400, JSON.stringify(body));
    const kept = await c.get("/api/clinics/me/opening-hours");
    assert.equal(kept.body.hours.length, 1);
    assert.equal(kept.body.hours[0].closesAt, "16:00");
  });

  it("en klinik ser aldrig en andens åbningstider", async () => {
    const x = await signupClinic();
    const y = await signupClinic();
    await x.c.put("/api/clinics/me/opening-hours", { hours: [{ weekday: 1, opensAt: "08:00", closesAt: "16:00", isEmergency: false }] });
    assert.deepEqual((await y.c.get("/api/clinics/me/opening-hours")).body.hours, []);
  });
});

describe("egen klinik: blokeringer", () => {
  it("opretter, lister (med interval) og sletter", async () => {
    const { c } = await signupClinic();
    const created = await c.post("/api/clinics/me/time-blocks", {
      startsAt: "2030-07-01T08:00:00+02:00",
      endsAt: "2030-07-15T16:00:00+02:00",
      note: "Sommerferie",
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.note, "Sommerferie");
    await c.post("/api/clinics/me/time-blocks", { startsAt: "2031-01-01T08:00:00Z", endsAt: "2031-01-01T12:00:00Z" });

    assert.equal((await c.get("/api/clinics/me/time-blocks")).body.blocks.length, 2);
    const july = await c.get("/api/clinics/me/time-blocks?from=2030-07-10T00:00:00Z&to=2030-07-20T00:00:00Z");
    assert.deepEqual(july.body.blocks.map((b: { id: string }) => b.id), [created.body.id]);
    assert.equal((await c.get("/api/clinics/me/time-blocks?from=2030-08-01T00:00:00Z&to=2030-08-02T00:00:00Z")).body.blocks.length, 0);

    assert.equal((await c.del(`/api/clinics/me/time-blocks/${created.body.id}`)).status, 204);
    assert.equal((await c.get("/api/clinics/me/time-blocks")).body.blocks.length, 1);
    assert.equal((await c.del(`/api/clinics/me/time-blocks/${created.body.id}`)).status, 404);
  });

  it("afviser slut før start og ugyldige tidspunkter", async () => {
    const { c } = await signupClinic();
    for (const body of [
      { startsAt: "2030-07-02T08:00:00Z", endsAt: "2030-07-01T08:00:00Z" },
      { startsAt: "2030-07-01T08:00:00Z", endsAt: "2030-07-01T08:00:00Z" },
      { startsAt: "i morgen", endsAt: "2030-07-01T08:00:00Z" },
      { startsAt: "2030-07-01T08:00:00Z" },
    ]) {
      assert.equal((await c.post("/api/clinics/me/time-blocks", body)).status, 400, JSON.stringify(body));
    }
    assert.equal((await c.get("/api/clinics/me/time-blocks?from=ikke-en-dato")).status, 400);
  });

  it("giver 404 for en andens blokering og for ugyldigt id", async () => {
    const x = await signupClinic();
    const y = await signupClinic();
    const block = await x.c.post("/api/clinics/me/time-blocks", { startsAt: "2030-07-01T08:00:00Z", endsAt: "2030-07-02T08:00:00Z" });
    assert.equal((await y.c.del(`/api/clinics/me/time-blocks/${block.body.id}`)).status, 404);
    assert.deepEqual((await y.c.get("/api/clinics/me/time-blocks")).body.blocks, []);
    assert.equal((await x.c.get("/api/clinics/me/time-blocks")).body.blocks.length, 1);
    assert.equal((await y.c.del("/api/clinics/me/time-blocks/ikke-uuid")).status, 404);
  });
});

async function fetchPublic(url: string) {
  const res = await fetch(url);
  return { status: res.status, type: res.headers.get("content-type"), body: Buffer.from(await res.arrayBuffer()) };
}

describe("egen klinik: logo", () => {
  it("uploader JPEG uden EXIF, viser den offentligt og kan slette den", async () => {
    const { c, clinicId } = await signupClinic();
    const original = await jpegWithExif();
    const { default: sharp } = await import("sharp");
    assert.ok((await sharp(original).metadata()).exif, "testbilledet har EXIF");

    const up = await c.postForm("/api/clinics/me/logo", imageForm(original));
    assert.equal(up.status, 200, JSON.stringify(up.body));
    assert.ok(up.body.logoUrl.includes(`/public-media/clinics/${clinicId}/logo.jpg`));
    const file = await fetchPublic(up.body.logoUrl);
    assert.equal(file.status, 200);
    assert.equal(file.type, "image/jpeg");
    assert.equal((await sharp(file.body).metadata()).exif, undefined, "EXIF er fjernet");
    assert.ok((await c.get("/api/clinics/me")).body.logoUrl.includes("logo.jpg"));

    // Erstatning på samme sti.
    assert.equal((await c.postForm("/api/clinics/me/logo", imageForm(original))).status, 200);

    assert.equal((await c.del("/api/clinics/me/logo")).status, 204);
    assert.equal((await c.get("/api/clinics/me")).body.logoUrl, null);
    assert.notEqual((await fetchPublic(up.body.logoUrl)).status, 200);
    assert.equal((await c.del("/api/clinics/me/logo")).status, 204);
  });

  it("afviser andet end billeder og manglende fil", async () => {
    const { c } = await signupClinic();
    const text = new FormData();
    text.set("file", new Blob(["det her er ikke et billede"], { type: "image/jpeg" }), "x.jpg");
    const notImage = await c.postForm("/api/clinics/me/logo", text);
    assert.equal(notImage.status, 400);
    assert.equal(notImage.body.error.code, "INVALID_IMAGE");
    assert.equal((await c.postForm("/api/clinics/me/logo", new FormData())).status, 400);
  });

  it("patienter kan ikke uploade logo", async () => {
    const p = await patientClient();
    assert.equal((await p.postForm("/api/clinics/me/logo", imageForm(await jpegWithExif()))).status, 403);
  });
});

describe("tandlæger", () => {
  it("opretter, lister, ændrer og sletter", async () => {
    const { c } = await signupClinic();
    const a = await c.post("/api/clinics/me/dentists", { fullName: "Dr. Anna Test", title: "Tandlæge", bio: "Fiktiv.", sortOrder: 2 });
    assert.equal(a.status, 201, JSON.stringify(a.body));
    assert.deepEqual(a.body.portfolio, []);
    assert.equal(a.body.photoUrl, null);
    const b = await c.post("/api/clinics/me/dentists", { fullName: "Dr. Bo Test", sortOrder: 1 });
    assert.equal(b.body.title, null);

    const list = await c.get("/api/clinics/me/dentists");
    assert.deepEqual(list.body.dentists.map((d: { fullName: string }) => d.fullName), ["Dr. Bo Test", "Dr. Anna Test"]);

    const patched = await c.patch(`/api/clinics/me/dentists/${a.body.id}`, { title: "Specialtandlæge", bio: "" });
    assert.equal(patched.status, 200, JSON.stringify(patched.body));
    assert.equal(patched.body.title, "Specialtandlæge");
    assert.equal(patched.body.bio, null);
    assert.equal((await c.get("/api/clinics/me")).body.dentists.length, 2);

    assert.equal((await c.del(`/api/clinics/me/dentists/${b.body.id}`)).status, 204);
    assert.equal((await c.get("/api/clinics/me/dentists")).body.dentists.length, 1);
    assert.equal((await c.del(`/api/clinics/me/dentists/${b.body.id}`)).status, 404);
  });

  it("validerer input", async () => {
    const { c } = await signupClinic();
    for (const body of [{}, { fullName: "" }, { fullName: "x".repeat(101) }, { fullName: "A", bio: "x".repeat(1001) }, { fullName: "A", extra: 1 }]) {
      assert.equal((await c.post("/api/clinics/me/dentists", body)).status, 400, JSON.stringify(body));
    }
  });

  it("giver 404 for en andens tandlæge (ændring, sletning, portræt)", async () => {
    const x = await signupClinic();
    const y = await signupClinic();
    const d = await x.c.post("/api/clinics/me/dentists", { fullName: "Dr. X" });
    const id = d.body.id;
    assert.equal((await y.c.patch(`/api/clinics/me/dentists/${id}`, { fullName: "Overtaget" })).status, 404);
    assert.equal((await y.c.postForm(`/api/clinics/me/dentists/${id}/photo`, imageForm(await jpegWithExif()))).status, 404);
    assert.equal((await y.c.del(`/api/clinics/me/dentists/${id}/photo`)).status, 404);
    assert.equal((await y.c.del(`/api/clinics/me/dentists/${id}`)).status, 404);
    assert.deepEqual((await y.c.get("/api/clinics/me/dentists")).body.dentists, []);
    const still = await x.c.get("/api/clinics/me/dentists");
    assert.equal(still.body.dentists[0].fullName, "Dr. X");
  });

  it("uploader og sletter portræt (EXIF fjernes)", async () => {
    const { c, clinicId } = await signupClinic();
    const d = await c.post("/api/clinics/me/dentists", { fullName: "Dr. Foto" });
    const up = await c.postForm(`/api/clinics/me/dentists/${d.body.id}/photo`, imageForm(await jpegWithExif()));
    assert.equal(up.status, 200, JSON.stringify(up.body));
    assert.ok(up.body.photoUrl.includes(`/clinics/${clinicId}/dentists/${d.body.id}.jpg`));
    const file = await fetchPublic(up.body.photoUrl);
    assert.equal(file.status, 200);
    const { default: sharp } = await import("sharp");
    assert.equal((await sharp(file.body).metadata()).exif, undefined);
    assert.match((await c.get("/api/clinics/me/dentists")).body.dentists[0].photoUrl, /\?v=\d+$/);

    assert.equal((await c.del(`/api/clinics/me/dentists/${d.body.id}/photo`)).status, 204);
    assert.equal((await c.get("/api/clinics/me/dentists")).body.dentists[0].photoUrl, null);
    assert.notEqual((await fetchPublic(up.body.photoUrl)).status, 200);
  });
});

describe("portefølje", () => {
  async function clinicWithDentist() {
    const s = await signupClinic();
    const d = await s.c.post("/api/clinics/me/dentists", { fullName: "Dr. Portefølje" });
    return { ...s, dentistId: d.body.id as string };
  }

  const consent = { patientConsentConfirmed: "true", consentTextVersion: PORTFOLIO_CONSENT_VERSION };

  it("afviser upload uden samtykkebekræftelse (400) og med forkert tekstversion", async () => {
    const { c, dentistId } = await clinicWithDentist();
    const img = await jpegWithExif();
    const none = await c.postForm("/api/clinics/me/portfolio", imageForm(img, { dentistId }));
    assert.equal(none.status, 400);
    const unchecked = await c.postForm("/api/clinics/me/portfolio", imageForm(img, { dentistId, patientConsentConfirmed: "false", consentTextVersion: PORTFOLIO_CONSENT_VERSION }));
    assert.equal(unchecked.status, 400);
    const wrongVersion = await c.postForm("/api/clinics/me/portfolio", imageForm(img, { dentistId, patientConsentConfirmed: "true", consentTextVersion: "gammel" }));
    assert.equal(wrongVersion.status, 400);
    assert.deepEqual((await c.get("/api/clinics/me/dentists")).body.dentists[0].portfolio, []);
  });

  it("uploader (EXIF fjernes), viser billedet på tandlægen, ændrer tekst og sletter række og fil", async () => {
    const { c, clinicId, dentistId } = await clinicWithDentist();
    const [serviceId] = await serviceIds(c, 1);
    const up = await c.postForm("/api/clinics/me/portfolio", imageForm(await jpegWithExif(), { dentistId, serviceId, caption: "Før og efter", ...consent }));
    assert.equal(up.status, 201, JSON.stringify(up.body));
    assert.equal(up.body.dentistId, dentistId);
    assert.equal(up.body.serviceId, serviceId);
    assert.ok(up.body.serviceName);
    assert.ok(up.body.patientConsentConfirmedAt);
    assert.ok(up.body.imageUrl.includes(`/clinics/${clinicId}/portfolio/${up.body.id}.jpg`));

    const file = await fetchPublic(up.body.imageUrl);
    assert.equal(file.status, 200);
    const { default: sharp } = await import("sharp");
    assert.equal((await sharp(file.body).metadata()).exif, undefined);

    const row = await admin.from("portfolio_items").select("consent_text_version, patient_consent_confirmed_at").eq("id", up.body.id).single();
    assert.equal(row.data?.consent_text_version, PORTFOLIO_CONSENT_VERSION);
    assert.ok(row.data?.patient_consent_confirmed_at);

    const dentist = (await c.get("/api/clinics/me/dentists")).body.dentists[0];
    assert.equal(dentist.portfolio.length, 1);
    assert.equal(dentist.portfolio[0].caption, "Før og efter");

    const patched = await c.patch(`/api/clinics/me/portfolio/${up.body.id}`, { caption: "Ny tekst", serviceId: null });
    assert.equal(patched.status, 200, JSON.stringify(patched.body));
    assert.equal(patched.body.caption, "Ny tekst");
    assert.equal(patched.body.serviceId, null);
    assert.equal(patched.body.serviceName, null);

    assert.equal((await c.del(`/api/clinics/me/portfolio/${up.body.id}`)).status, 204);
    assert.deepEqual((await c.get("/api/clinics/me/dentists")).body.dentists[0].portfolio, []);
    assert.notEqual((await fetchPublic(up.body.imageUrl)).status, 200);
    const gone = await admin.from("portfolio_items").select("id").eq("id", up.body.id);
    assert.equal(gone.data?.length, 0);
    assert.equal((await c.del(`/api/clinics/me/portfolio/${up.body.id}`)).status, 404);
  });

  it("afviser ikke-billeder, ukendt tandlæge og ukendt ydelse", async () => {
    const { c, dentistId } = await clinicWithDentist();
    const text = new FormData();
    text.set("file", new Blob(["ikke et billede"], { type: "image/jpeg" }), "x.jpg");
    for (const [k, v] of Object.entries({ dentistId, ...consent })) text.set(k, v);
    const notImage = await c.postForm("/api/clinics/me/portfolio", text);
    assert.equal(notImage.status, 400);
    assert.equal(notImage.body.error.code, "INVALID_IMAGE");

    const img = await jpegWithExif();
    const otherDentist = await c.postForm("/api/clinics/me/portfolio", imageForm(img, { dentistId: "00000000-0000-4000-8000-000000000000", ...consent }));
    assert.equal(otherDentist.status, 404);
    const badService = await c.postForm("/api/clinics/me/portfolio", imageForm(img, { dentistId, serviceId: "00000000-0000-4000-8000-000000000000", ...consent }));
    assert.equal(badService.status, 400);
    assert.equal(badService.body.error.code, "UNKNOWN_SERVICE");
    assert.equal((await c.postForm("/api/clinics/me/portfolio", new FormData())).status, 400);
  });

  it("giver 404 for en andens tandlæge og billede, og patienter får 403", async () => {
    const x = await clinicWithDentist();
    const y = await clinicWithDentist();
    const img = await jpegWithExif();
    const item = await x.c.postForm("/api/clinics/me/portfolio", imageForm(img, { dentistId: x.dentistId, ...consent }));
    assert.equal(item.status, 201);

    const foreignDentist = await y.c.postForm("/api/clinics/me/portfolio", imageForm(img, { dentistId: x.dentistId, ...consent }));
    assert.equal(foreignDentist.status, 404);
    assert.equal((await y.c.patch(`/api/clinics/me/portfolio/${item.body.id}`, { caption: "overtaget" })).status, 404);
    assert.equal((await y.c.del(`/api/clinics/me/portfolio/${item.body.id}`)).status, 404);
    assert.equal((await fetchPublic(item.body.imageUrl)).status, 200);
    assert.equal((await x.c.get("/api/clinics/me/dentists")).body.dentists[0].portfolio[0].caption, null);

    const p = await patientClient();
    assert.equal((await p.postForm("/api/clinics/me/portfolio", imageForm(img, { dentistId: x.dentistId, ...consent }))).status, 403);
    assert.equal((await p.del(`/api/clinics/me/portfolio/${item.body.id}`)).status, 403);
  });

  it("sletning af tandlæge fjerner også portræt og portefølje (rækker og filer)", async () => {
    const { c, dentistId } = await clinicWithDentist();
    const img = await jpegWithExif();
    const photo = await c.postForm(`/api/clinics/me/dentists/${dentistId}/photo`, imageForm(img));
    const item = await c.postForm("/api/clinics/me/portfolio", imageForm(img, { dentistId, ...consent }));
    assert.equal(item.status, 201);
    assert.equal((await c.del(`/api/clinics/me/dentists/${dentistId}`)).status, 204);
    assert.notEqual((await fetchPublic(photo.body.photoUrl)).status, 200);
    assert.notEqual((await fetchPublic(item.body.imageUrl)).status, 200);
    assert.equal((await admin.from("portfolio_items").select("id").eq("id", item.body.id)).data?.length, 0);
  });
});

describe("sletning af klinikkonto", () => {
  it("kræver bekræftelsen SLET", async () => {
    const { c } = await signupClinic();
    assert.equal((await c.del("/api/clinics/me", {})).status, 400);
    assert.equal((await c.del("/api/clinics/me", { confirm: "slet" })).status, 400);
    assert.equal((await c.get("/api/clinics/me")).status, 200);
  });

  it("patienter kan ikke bruge ruten", async () => {
    const p = await patientClient();
    assert.equal((await p.del("/api/clinics/me", { confirm: "SLET" })).status, 403);
  });

  it("gør en selvoprettet klinik removed: CVR, telefon og åbningstider væk, navn og adresse bevaret, og CVR kan bruges igen", async () => {
    const { c, userId, cvr, clinicId } = await signupClinic();
    const img = await jpegWithExif();
    const logo = await c.postForm("/api/clinics/me/logo", imageForm(img));
    const [a] = await serviceIds(c, 1);
    await c.put("/api/clinics/me/prices", { prices: [{ serviceId: a, priceMin: 1, priceMax: 2, durationMin: 30 }] });
    await c.put("/api/clinics/me/opening-hours", { hours: [{ weekday: 1, opensAt: "08:00", closesAt: "16:00", isEmergency: false }] });
    await c.patch("/api/clinics/me", { description: "Skal slettes", email: "privat@slettes.test", website: "https://slettes.test" });

    assert.equal((await c.del("/api/clinics/me", { confirm: "SLET" })).status, 204);
    createdUserIds.delete(userId);
    assert.equal((await c.get("/api/me")).status, 401);
    assert.notEqual((await fetchPublic(logo.body.logoUrl)).status, 200);

    const row = await admin
      .from("clinics")
      .select("status, cvr, owner_id, phone, name, address, postal_code, city, description, email, website, logo_path, verified_at, owner_since")
      .eq("id", clinicId)
      .single();
    assert.equal(row.data?.status, "removed");
    assert.equal(row.data?.cvr, null);
    assert.equal(row.data?.owner_id, null);
    assert.equal(row.data?.phone, null);
    assert.equal(row.data?.name, "Testklinikken ApS");
    assert.equal(row.data?.address, "Testvej 1");
    assert.equal(row.data?.postal_code, "2100");
    assert.equal(row.data?.city, "København Ø");
    assert.deepEqual([row.data?.description, row.data?.email, row.data?.website, row.data?.logo_path, row.data?.verified_at, row.data?.owner_since], [null, null, null, null, null, null]);
    for (const table of ["clinic_prices", "clinic_service_groups", "clinic_opening_hours", "clinic_time_blocks", "clinic_dentists"]) {
      assert.equal((await admin.from(table).select("clinic_id").eq("clinic_id", clinicId)).data?.length, 0, table);
    }
    assert.equal((await admin.storage.from("public-media").list(`clinics/${clinicId}`)).data?.length ?? 0, 0);

    // Samme CVR kan oprette en ny klinik; den slettede er urørt.
    const again = await newClientWithTerms();
    const r = await again.post("/api/auth/signup", clinicBody(cvr));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    createdUserIds.add(r.body.userId);
    const me = await again.get("/api/me");
    assert.notEqual(me.body.clinic.id, clinicId);
    assert.equal(me.body.clinic.status, "registered");
    assert.equal((await admin.from("clinics").select("status").eq("id", clinicId).single()).data?.status, "removed");
    await admin.from("clinics").delete().eq("id", clinicId);
  });

  it("rydder også rækkerne, når ejeren slettes uden om API'et (triggeren)", async () => {
    const { c, userId, clinicId } = await signupClinic();
    await admin.from("clinics").update({ import_source: "cvr" }).eq("id", clinicId);
    const [a] = await serviceIds(c, 1);
    await c.put("/api/clinics/me/prices", { prices: [{ serviceId: a, priceMin: 1, priceMax: 2, durationMin: 30 }] });
    await c.patch("/api/clinics/me", { email: "privat@slettes.test", website: "https://slettes.test" });
    const del = await admin.auth.admin.deleteUser(userId);
    assert.ifError(del.error);
    createdUserIds.delete(userId);
    assert.equal((await admin.from("clinic_prices").select("service_id").eq("clinic_id", clinicId)).data?.length, 0);
    const row = await admin.from("clinics").select("status, email, website").eq("id", clinicId).single();
    assert.deepEqual(row.data, { status: "imported", email: null, website: null });
    await admin.from("clinics").delete().eq("id", clinicId);
  });

  // En importeret klinik, der er overtaget via CVR (import_source sat), bliver `imported` med bevarede grunddata.
  // En selvoprettet klinik (import_source null) bliver `removed` (se næste tests).
  it("gør en overtaget importeret klinik importeret igen, fjerner filer og rækker og logger ud", async () => {
    const { c, userId, clinicId } = await signupClinic();
    await admin.from("clinics").update({ import_source: "cvr" }).eq("id", clinicId);
    const img = await jpegWithExif();
    const logo = await c.postForm("/api/clinics/me/logo", imageForm(img));
    const d = await c.post("/api/clinics/me/dentists", { fullName: "Dr. Slettes" });
    const photo = await c.postForm(`/api/clinics/me/dentists/${d.body.id}/photo`, imageForm(img));
    const item = await c.postForm(
      "/api/clinics/me/portfolio",
      imageForm(img, { dentistId: d.body.id, patientConsentConfirmed: "true", consentTextVersion: PORTFOLIO_CONSENT_VERSION }),
    );
    for (const url of [logo.body.logoUrl, photo.body.photoUrl, item.body.imageUrl]) {
      assert.equal((await fetchPublic(url)).status, 200);
    }
    const [a] = await serviceIds(c, 1);
    await c.put("/api/clinics/me/prices", { prices: [{ serviceId: a, priceMin: 1, priceMax: 2, durationMin: 30 }] });
    await c.put("/api/clinics/me/opening-hours", { hours: [{ weekday: 1, opensAt: "08:00", closesAt: "16:00", isEmergency: false }] });
    await c.post("/api/clinics/me/time-blocks", { startsAt: "2030-07-01T08:00:00Z", endsAt: "2030-07-02T08:00:00Z" });
    await c.patch("/api/clinics/me", {
      description: "Skal slettes",
      email: "privat@slettes.test",
      website: "https://slettes.test",
      trustpilotUrl: "https://dk.trustpilot.com/review/slettes.test",
      trustpilotScore: 4.2,
      trustpilotReviewCount: 10,
    });
    const before = await admin.from("clinics").select("name, address, postal_code, city, phone").eq("id", clinicId).single();

    const del = await c.del("/api/clinics/me", { confirm: "SLET" });
    assert.equal(del.status, 204);
    createdUserIds.delete(userId);

    assert.equal((await c.get("/api/me")).status, 401);
    for (const url of [logo.body.logoUrl, photo.body.photoUrl, item.body.imageUrl]) {
      assert.notEqual((await fetchPublic(url)).status, 200);
    }
    const clinic = await admin.from("clinics").select("status, owner_id, logo_path, verified_at, owner_since").eq("id", clinicId).single();
    assert.equal(clinic.data?.status, "imported");
    assert.equal(clinic.data?.owner_id, null);
    assert.equal(clinic.data?.logo_path, null);
    assert.equal(clinic.data?.owner_since, null);
    assert.equal((await admin.from("clinic_dentists").select("id").eq("clinic_id", clinicId)).data?.length, 0);
    assert.equal((await admin.from("portfolio_items").select("id").eq("clinic_id", clinicId)).data?.length, 0);
    assert.equal((await admin.from("clinic_prices").select("service_id").eq("clinic_id", clinicId)).data?.length, 0);
    assert.equal((await admin.from("clinic_time_blocks").select("id").eq("clinic_id", clinicId)).data?.length, 0);
    assert.equal((await admin.from("clinic_service_groups").select("group_id").eq("clinic_id", clinicId)).data?.length, 0);
    assert.equal(clinic.data?.logo_path, null);
    const kept = await admin
      .from("clinics")
      .select("name, address, postal_code, city, phone, description, email, website, trustpilot_url, trustpilot_score, trustpilot_review_count, trustpilot_entered_by")
      .eq("id", clinicId)
      .single();
    assert.equal(kept.data?.description, null);
    // En senere ejer af samme CVR må ikke se den slettede kontos e-mail eller hjemmeside (10.8).
    assert.equal(kept.data?.email, null);
    assert.equal(kept.data?.website, null);
    assert.equal(kept.data?.trustpilot_url, null);
    assert.equal(kept.data?.trustpilot_score, null);
    assert.equal(kept.data?.trustpilot_review_count, null);
    assert.equal(kept.data?.trustpilot_entered_by, null);
    // Offentlige grunddata og åbningstider bevares.
    assert.deepEqual(
      { name: kept.data?.name, address: kept.data?.address, postal_code: kept.data?.postal_code, city: kept.data?.city, phone: kept.data?.phone },
      before.data,
    );
    assert.equal((await admin.from("clinic_opening_hours").select("id").eq("clinic_id", clinicId)).data?.length, 1);
    const listed = await admin.storage.from("public-media").list(`clinics/${clinicId}`);
    assert.equal(listed.data?.length ?? 0, 0);
    assert.equal((await admin.auth.admin.getUserById(userId)).data?.user ?? null, null);

    // Oprydning af testrækken.
    await admin.from("clinics").delete().eq("id", clinicId);
  });
  it("bevarer Trustpilot, som admin har indtastet,", async () => {
    const { c, userId, clinicId } = await signupClinic();
    await admin.from("clinics").update({ import_source: "cvr" }).eq("id", clinicId);
    await c.patch("/api/clinics/me", { description: "Tekst" });
    await admin
      .from("clinics")
      .update({
        trustpilot_url: "https://dk.trustpilot.com/review/admin.test",
        trustpilot_score: 4.8,
        trustpilot_review_count: 50,
        trustpilot_entered_by: "admin",
      })
      .eq("id", clinicId);
    assert.equal((await c.del("/api/clinics/me", { confirm: "SLET" })).status, 204);
    createdUserIds.delete(userId);
    const row = await admin
      .from("clinics")
      .select("status, description, trustpilot_url, trustpilot_score, trustpilot_entered_by")
      .eq("id", clinicId)
      .single();
    assert.equal(row.data?.status, "imported");
    assert.equal(row.data?.description, null);
    assert.equal(row.data?.trustpilot_url, "https://dk.trustpilot.com/review/admin.test");
    assert.equal(row.data?.trustpilot_score, 4.8);
    assert.equal(row.data?.trustpilot_entered_by, "admin");
    await admin.from("clinics").delete().eq("id", clinicId);
  });
});

describe("lofter og rate limit", () => {
  it("den 11. billedupload i en time fra samme IP giver 429 RATE_LIMITED (logo, portræt og portefølje deler grænsen)", async () => {
    const { c } = await signupClinic();
    const d = await c.post("/api/clinics/me/dentists", { fullName: "Dr. Grænse" });
    const img = await jpegWithExif();
    for (let i = 0; i < 4; i++) assert.equal((await c.postForm("/api/clinics/me/logo", imageForm(img))).status, 200);
    for (let i = 0; i < 3; i++) assert.equal((await c.postForm(`/api/clinics/me/dentists/${d.body.id}/photo`, imageForm(img))).status, 200);
    for (let i = 0; i < 3; i++) {
      const r = await c.postForm(
        "/api/clinics/me/portfolio",
        imageForm(img, { dentistId: d.body.id, patientConsentConfirmed: "true", consentTextVersion: PORTFOLIO_CONSENT_VERSION }),
      );
      assert.equal(r.status, 201, JSON.stringify(r.body));
    }
    for (const send of [
      () => c.postForm("/api/clinics/me/logo", imageForm(img)),
      () => c.postForm(`/api/clinics/me/dentists/${d.body.id}/photo`, imageForm(img)),
      () => c.postForm("/api/clinics/me/portfolio", imageForm(img, { dentistId: d.body.id, patientConsentConfirmed: "true", consentTextVersion: PORTFOLIO_CONSENT_VERSION })),
    ]) {
      const r = await send();
      assert.equal(r.status, 429);
      assert.equal(r.body.error.code, "RATE_LIMITED");
    }
    // Andre kald end uploads rammes ikke.
    assert.equal((await c.get("/api/clinics/me")).status, 200);
    // En anden IP har sin egen grænse.
    const other = await signupClinic();
    assert.equal((await other.c.postForm("/api/clinics/me/logo", imageForm(img))).status, 200);
  });

  it("den 201. blokerede tid giver 429 TIME_BLOCK_LIMIT (også i databasen)", async () => {
    const { c, clinicId } = await signupClinic();
    const rows = Array.from({ length: 200 }, (_, i) => ({
      clinic_id: clinicId,
      starts_at: new Date(Date.UTC(2031, 0, 1 + i, 8)).toISOString(),
      ends_at: new Date(Date.UTC(2031, 0, 1 + i, 9)).toISOString(),
    }));
    assert.ifError((await admin.from("clinic_time_blocks").insert(rows)).error);
    const r = await c.post("/api/clinics/me/time-blocks", { startsAt: "2032-01-01T08:00:00Z", endsAt: "2032-01-01T09:00:00Z" });
    assert.equal(r.status, 429, JSON.stringify(r.body));
    assert.equal(r.body.error.code, "TIME_BLOCK_LIMIT");
  });

  it("den 31. tandlæge giver 429 DENTIST_LIMIT", async () => {
    const { c, clinicId } = await signupClinic();
    assert.ifError((await admin.from("clinic_dentists").insert(Array.from({ length: 30 }, (_, i) => ({ clinic_id: clinicId, full_name: `Dr. ${i}` })))).error);
    const r = await c.post("/api/clinics/me/dentists", { fullName: "Dr. For mange" });
    assert.equal(r.status, 429);
    assert.equal(r.body.error.code, "DENTIST_LIMIT");
  });

  it("afviser klinik-website uden http(s), og tom PATCH returnerer den uændrede klinik", async () => {
    const { c } = await signupClinic();
    assert.equal((await c.patch("/api/clinics/me", { website: "javascript:alert(1)" })).status, 400);
    assert.equal((await c.patch("/api/clinics/me", { website: "klinik.dk" })).status, 400);
    const before = (await c.get("/api/clinics/me")).body;
    const empty = await c.patch("/api/clinics/me", {});
    assert.equal(empty.status, 200);
    assert.equal(empty.body.name, before.name);
  });
});
