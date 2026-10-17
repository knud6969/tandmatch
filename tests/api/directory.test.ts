// API-tests for trin 2: offentlig klinikoversigt, profil, ledige tider og anmeldelser (architecture 6.6, 6.7, 10.7).
// Testen opretter sine egne fiktive klinikker (verificeret, oprettet, importeret og slettet) og slår dem op på id,
// så andre klinikker i databasen (fx demodata) ikke forstyrrer.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PASSWORD, TestClient, adminClient, newClientWithTerms, randomCvr, uniqueEmail } from "./helpers.ts";

const admin = adminClient();
const createdUserIds = new Set<string>();
const importedIds: string[] = [];
const RUN = randomUUID().slice(0, 8);

type Hour = { weekday: number; opensAt: string; closesAt: string; isEmergency: boolean };
type Clinic = { c: TestClient; userId: string; clinicId: string };

// Alle ugedage: almindeligt vindue 08:00-16:00 og akutvindue 16:00-23:45, så der altid er tider de næste dage.
const DAILY_HOURS: Hour[] = [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) => [
  { weekday, opensAt: "08:00", closesAt: "16:00", isEmergency: false },
  { weekday, opensAt: "16:00", closesAt: "23:45", isEmergency: true },
]);
const REGULAR_ONLY_HOURS: Hour[] = DAILY_HOURS.filter((h) => !h.isEmergency);

let EXAM: { id: string; slug: string; groupId: string };
let OTHER: { id: string; slug: string; groupId: string };
let EMERGENCY: { id: string; slug: string; groupId: string };

let clinicA: Clinic; // verificeret, 2100, billig, med akutvindue
let clinicB: Clinic; // verificeret, 8000, dyrere, uden akutvindue
let registered: Clinic;
let removed: Clinic;
let importedId: string;
let importedFarId: string;

async function signupClinic(name: string, postalCode: string, city: string): Promise<Clinic> {
  const c = await newClientWithTerms();
  const r = await c.post("/api/auth/signup", {
    role: "clinic",
    email: uniqueEmail("klinik"),
    password: PASSWORD,
    cvr: randomCvr(),
    clinicName: name,
    address: "Testvej 1",
    postalCode,
    city,
    phone: "00 00 00 01",
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  createdUserIds.add(r.body.userId);
  const me = await c.get("/api/me");
  return { c, userId: r.body.userId, clinicId: me.body.clinic.id };
}

async function setUp(clinic: Clinic, prices: { service: { id: string; groupId: string }; min: number; max: number; duration: number }[], hours: Hour[]) {
  const groups = [...new Set(prices.map((p) => p.service.groupId))];
  assert.equal((await clinic.c.put("/api/clinics/me/service-groups", { groupIds: groups })).status, 200);
  const put = await clinic.c.put("/api/clinics/me/prices", {
    prices: prices.map((p) => ({ serviceId: p.service.id, priceMin: p.min, priceMax: p.max, durationMin: p.duration })),
  });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  const oh = await clinic.c.put("/api/clinics/me/opening-hours", { hours });
  assert.equal(oh.status, 200, JSON.stringify(oh.body));
}

async function verify(clinicId: string) {
  const { error } = await admin.rpc("admin_set_clinic_status", { p_clinic_id: clinicId, p_status: "verified" });
  assert.ifError(error);
}

async function insertImported(name: string, postalCode: string, city: string): Promise<string> {
  // Importen sætter selv koordinaterne (triggeren gør det kun, når en klinik ændrer postnummer).
  const place = await admin.from("postal_codes").select("lat, lng").eq("postal_code", postalCode).single();
  assert.ifError(place.error);
  const { data, error } = await admin
    .from("clinics")
    .insert({
      lat: place.data!.lat,
      lng: place.data!.lng,
      status: "imported",
      cvr: randomCvr(),
      name,
      address: "Gammelvej 2",
      postal_code: postalCode,
      city,
      phone: "00 00 00 02",
      website: "https://example.test/importeret",
      import_source: "seed",
      trustpilot_url: "https://dk.trustpilot.com/review/importeret.example.test",
      trustpilot_score: 4.1,
      trustpilot_review_count: 33,
      trustpilot_entered_by: "admin",
    })
    .select("id")
    .single();
  assert.ifError(error);
  const id = data!.id as string;
  importedIds.push(id);
  const hours = await admin
    .from("clinic_opening_hours")
    .insert([1, 2, 3, 4, 5].map((weekday) => ({ clinic_id: id, weekday, opens_at: "09:00", closes_at: "17:00", is_emergency: false })));
  assert.ifError(hours.error);
  return id;
}

before(async () => {
  const c = await newClientWithTerms();
  const catalog = await c.get("/api/services");
  const all = (catalog.body.groups as { id: string; services: { id: string; slug: string; category: string }[] }[]).flatMap((g) =>
    g.services.map((s) => ({ id: s.id, slug: s.slug, category: s.category, groupId: g.id })),
  );
  EXAM = all.find((s) => s.slug === "undersoegelse")!;
  OTHER = all.find((s) => s.category !== "emergency" && s.slug !== "undersoegelse" && s.groupId !== EXAM.groupId)!;
  EMERGENCY = all.find((s) => s.slug === "akut_konsultation")!;
  assert.ok(EXAM && OTHER && EMERGENCY);

  clinicA = await signupClinic(`Directory A ${RUN}`, "2100", "København Ø");
  await clinicA.c.patch("/api/clinics/me", {
    description: "Vi er en lille testklinik.",
    email: "kontakt@a.example.test",
    website: "https://example.test/a",
    trustpilotUrl: "https://dk.trustpilot.com/review/a.example.test",
    trustpilotScore: 4.6,
    trustpilotReviewCount: 120,
  });
  await setUp(
    clinicA,
    [
      { service: EXAM, min: 400, max: 600, duration: 45 },
      { service: OTHER, min: 1000, max: 1500, duration: 60 },
      { service: EMERGENCY, min: 700, max: 900, duration: 30 },
    ],
    DAILY_HOURS,
  );
  const dentist = await clinicA.c.post("/api/clinics/me/dentists", { fullName: "Tandlæge Testesen", title: "Tandlæge" });
  assert.equal(dentist.status, 201, JSON.stringify(dentist.body));
  await verify(clinicA.clinicId);

  clinicB = await signupClinic(`Directory B ${RUN}`, "8000", "Aarhus C");
  await setUp(
    clinicB,
    [
      { service: EXAM, min: 800, max: 1000, duration: 30 },
      { service: OTHER, min: 2000, max: 2500, duration: 30 },
    ],
    REGULAR_ONLY_HOURS,
  );
  await verify(clinicB.clinicId);

  registered = await signupClinic(`Directory Oprettet ${RUN}`, "2100", "København Ø"); // forbliver `registered`

  removed = await signupClinic(`Directory Slettet ${RUN}`, "2100", "København Ø");
  const del = await removed.c.del("/api/clinics/me", { confirm: "SLET" });
  assert.equal(del.status, 204);
  createdUserIds.delete(removed.userId);

  importedId = await insertImported(`Directory Importeret ${RUN}`, "2100", "København Ø");
  importedFarId = await insertImported(`Directory Importeret Langt ${RUN}`, "8000", "Aarhus C");
});

after(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id).catch(() => {});
  for (const id of importedIds) await admin.from("clinics").delete().eq("id", id);
});

type ListItem = {
  id: string; name: string; tier: string; canReceiveLeads: boolean; distanceKm: number | null;
  trustpilot: { enteredBy: string; score: number } | null; reviewStats: { reviewCount: number } | null; logoUrl: string | null;
  prices: { serviceId: string }[]; priceForSelection: { min: number; max: number } | null;
  firstAvailableAt: string | null; firstEmergencyAt: string | null; openingHours: unknown[]; location: unknown;
};

async function list(query = ""): Promise<{ clinics: ListItem[]; sort: string; criteria: string[] }> {
  const c = await newClientWithTerms();
  const r = await c.get(`/api/clinics${query}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}
const find = (clinics: ListItem[], id: string) => clinics.find((x) => x.id === id);
const mine = () => [clinicA.clinicId, clinicB.clinicId, importedId, importedFarId, registered.clinicId, removed.clinicId];

describe("GET /api/clinics: synlighed og niveauer", () => {
  it("kræver vilkårs-accept", async () => {
    assert.equal((await new TestClient().get("/api/clinics")).status, 403);
  });

  it("er åben uden login og viser verificerede og importerede klinikker, men aldrig oprettede eller slettede", async () => {
    const { clinics } = await list();
    assert.ok(find(clinics, clinicA.clinicId));
    assert.ok(find(clinics, clinicB.clinicId));
    assert.ok(find(clinics, importedId));
    assert.equal(find(clinics, registered.clinicId), undefined);
    assert.equal(find(clinics, removed.clinicId), undefined);
  });

  it("viser basisniveau for importerede klinikker: grunddata og Trustpilot, ingen priser, anmeldelser eller statistik", async () => {
    const { clinics } = await list(`?services=${EXAM.slug}`);
    const item = find(clinics, importedId)!;
    assert.equal(item.tier, "basic");
    assert.equal(item.canReceiveLeads, false);
    assert.deepEqual(item.prices, []);
    assert.equal(item.priceForSelection, null);
    assert.equal(item.reviewStats, null);
    assert.equal(item.logoUrl, null);
    assert.equal(item.firstAvailableAt, null);
    assert.equal(item.firstEmergencyAt, null);
    assert.equal(item.trustpilot?.enteredBy, "admin");
    assert.equal(item.trustpilot?.score, 4.1);
    assert.equal(item.openingHours.length, 5);
    assert.ok(item.location);
    for (const hidden of ["cvr", "ownerId", "owner_id", "status", "email", "description"]) assert.equal(hidden in item, false, hidden);
  });

  it("viser fuldt niveau for verificerede klinikker: priser, statistik, første ledige tid og akuttid", async () => {
    const { clinics } = await list(`?services=${EXAM.slug},${OTHER.slug}`);
    const a = find(clinics, clinicA.clinicId)!;
    assert.equal(a.tier, "full");
    assert.equal(a.canReceiveLeads, true);
    assert.deepEqual(a.prices.map((p) => p.serviceId).sort(), [EXAM.id, OTHER.id].sort());
    assert.deepEqual(a.priceForSelection, { min: 1400, max: 2100 });
    assert.equal(a.reviewStats?.reviewCount, 0);
    assert.equal(a.trustpilot?.enteredBy, "clinic");
    assert.ok(a.firstAvailableAt && !Number.isNaN(Date.parse(a.firstAvailableAt)));
    assert.ok(a.firstEmergencyAt && !Number.isNaN(Date.parse(a.firstEmergencyAt)));
    const b = find(clinics, clinicB.clinicId)!;
    assert.deepEqual(b.priceForSelection, { min: 2800, max: 3500 });
    assert.equal(b.firstEmergencyAt, null); // ingen akutvindue
    assert.ok(b.firstAvailableAt);
  });

  it("viser ingen priser uden valgte behandlinger, og ingen sum, hvis en valgt behandling mangler i prislisten", async () => {
    const none = find((await list()).clinics, clinicA.clinicId)!;
    assert.deepEqual(none.prices, []);
    assert.equal(none.priceForSelection, null);
    // Klinik B har ingen pris for akutbehandlingen.
    const partial = find((await list(`?services=${EXAM.slug},${EMERGENCY.slug}`)).clinics, clinicB.clinicId)!;
    assert.equal(partial.priceForSelection, null);
    assert.deepEqual(partial.prices.map((p) => p.serviceId), [EXAM.id]);
  });
});

describe("GET /api/clinics: ?ids=", () => {
  it("returnerer kun de ønskede synlige klinikker; usynlige og ukendte udelades", async () => {
    const only = await list(`?ids=${clinicA.clinicId}`);
    assert.deepEqual(only.clinics.map((x) => x.id), [clinicA.clinicId]);
    const two = await list(`?ids=${clinicA.clinicId},${clinicB.clinicId}&postalCode=2100&maxDistanceKm=500`);
    assert.deepEqual(two.clinics.map((x) => x.id).sort(), [clinicA.clinicId, clinicB.clinicId].sort());
    const hidden = await list(`?ids=${registered.clinicId},${removed.clinicId},${randomUUID()}`);
    assert.deepEqual(hidden.clinics, []);
  });

  it("afviser flere end 3 og ugyldige id'er med 400", async () => {
    const c = await newClientWithTerms();
    const four = [clinicA, clinicB, registered, removed].map((x) => x.clinicId).join(",");
    assert.equal((await c.get(`/api/clinics?ids=${four}`)).status, 400);
    assert.equal((await c.get("/api/clinics?ids=ikke-et-uuid")).status, 400);
    assert.equal((await c.get(`/api/clinics?ids=${clinicA.clinicId},x`)).status, 400);
  });
});

describe("GET /api/clinics: filtre og sorteringer", () => {
  it("sorterer efter afstand fra postnummer som standard og viser afstanden", async () => {
    const r = await list("?postalCode=2100&maxDistanceKm=500");
    assert.equal(r.sort, "distance");
    const a = find(r.clinics, clinicA.clinicId)!;
    const b = find(r.clinics, clinicB.clinicId)!;
    assert.equal(a.distanceKm, 0);
    assert.ok(b.distanceKm! > 100);
    assert.ok(r.clinics.indexOf(a) < r.clinics.indexOf(b));
    assert.ok(r.criteria.some((line) => line.includes("Nærmeste først")));
  });

  it("begrænser til 25 km som standard, når der er en position, og følger maxDistanceKm", async () => {
    const near = await list("?postalCode=2100");
    assert.ok(find(near.clinics, clinicA.clinicId));
    assert.equal(find(near.clinics, clinicB.clinicId), undefined);
    assert.equal(find(near.clinics, importedFarId), undefined);
    assert.ok(near.criteria.includes("Højst 25 km væk"));
    const wide = await list("?postalCode=2100&maxDistanceKm=500");
    assert.ok(find(wide.clinics, clinicB.clinicId));
  });

  it("accepterer lat/lng i stedet for postnummer", async () => {
    const r = await list("?lat=55.6761&lng=12.5683&maxDistanceKm=30");
    assert.equal(r.sort, "distance");
    assert.ok(find(r.clinics, clinicA.clinicId));
    assert.equal(find(r.clinics, clinicB.clinicId), undefined);
  });

  it("sorterer efter pris for de valgte behandlinger, og klinikker uden pris står sidst", async () => {
    const r = await list(`?services=${EXAM.slug}&sort=price`);
    const ids = r.clinics.map((x) => x.id);
    assert.ok(ids.indexOf(clinicA.clinicId) < ids.indexOf(clinicB.clinicId));
    assert.ok(ids.indexOf(clinicB.clinicId) < ids.indexOf(importedId));
    assert.equal(r.sort, "price");
  });

  it("filtrerer på maks. pris (kræver valgte behandlinger)", async () => {
    const r = await list(`?services=${EXAM.slug}&maxPrice=500`);
    assert.ok(find(r.clinics, clinicA.clinicId));
    assert.equal(find(r.clinics, clinicB.clinicId), undefined);
    assert.equal(find(r.clinics, importedId), undefined); // basisniveau har ingen pris
    const noServices = await newClientWithTerms();
    assert.equal((await noServices.get("/api/clinics?maxPrice=500")).status, 400);
  });

  it("sorterer efter første ledige tid; klinikker uden står sidst", async () => {
    const r = await list(`?services=${EXAM.slug}&sort=first_available`);
    const ids = r.clinics.map((x) => x.id);
    assert.ok(ids.indexOf(clinicA.clinicId) < ids.indexOf(importedId));
    assert.ok(ids.indexOf(clinicB.clinicId) < ids.indexOf(importedId));
    const times = r.clinics.map((x) => x.firstAvailableAt).filter((t): t is string => t !== null).map(Date.parse);
    assert.deepEqual(times, [...times].sort((x, y) => x - y));
  });

  it("sorterer efter stjerner og prisnøjagtighed uden fejl; uden anmeldelser står alle med navn som rækkefølge", async () => {
    for (const sort of ["rating", "price_accuracy"]) {
      const r = await list(`?sort=${sort}`);
      assert.equal(r.sort, sort);
      const ids = r.clinics.map((x) => x.id);
      assert.ok(ids.indexOf(clinicA.clinicId) < ids.indexOf(clinicB.clinicId), sort); // lig: navn A før B
    }
  });

  it("minStars fjerner klinikker uden anmeldelser", async () => {
    const r = await list("?minStars=4");
    for (const id of mine()) assert.equal(find(r.clinics, id), undefined);
  });

  it("emergency=true viser kun klinikker med akuttid inden for 48 timer", async () => {
    const r = await list("?emergency=true");
    assert.equal(r.sort, "first_available");
    assert.ok(find(r.clinics, clinicA.clinicId));
    assert.equal(find(r.clinics, clinicB.clinicId), undefined);
    assert.equal(find(r.clinics, importedId), undefined);
    assert.ok(r.criteria.some((line) => line.includes("Akuttid")));
  });

  it("contactableOnly viser kun verificerede klinikker", async () => {
    const r = await list("?contactableOnly=true");
    assert.ok(find(r.clinics, clinicA.clinicId));
    assert.equal(find(r.clinics, importedId), undefined);
    assert.ok(r.clinics.every((x) => x.canReceiveLeads));
  });

  it("afviser ugyldige parametre", async () => {
    const c = await newClientWithTerms();
    const bad = [
      "?sort=billigst", "?services=findes_ikke", "?postalCode=0000", "?postalCode=12", "?lat=55", "?lng=12", "?lat=abc&lng=12",
      "?minStars=9", "?emergency=maybe", "?maxDistanceKm=-1",
    ];
    for (const query of bad) assert.equal((await c.get(`/api/clinics${query}`)).status, 400, query);
  });
});

describe("GET /api/clinics/[id]", () => {
  it("giver den fulde profil for en verificeret klinik", async () => {
    const c = await newClientWithTerms();
    const r = await c.get(`/api/clinics/${clinicA.clinicId}?services=${EXAM.slug}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.tier, "full");
    assert.equal(r.body.description, "Vi er en lille testklinik.");
    assert.equal(r.body.email, "kontakt@a.example.test");
    assert.equal(r.body.website, "https://example.test/a");
    assert.equal(r.body.allPrices.length, 3);
    assert.deepEqual(r.body.prices.map((p: { serviceId: string }) => p.serviceId), [EXAM.id]);
    assert.deepEqual(r.body.priceForSelection, { min: 400, max: 600 });
    assert.equal(r.body.dentists.length, 1);
    assert.equal(r.body.dentists[0].fullName, "Tandlæge Testesen");
    assert.deepEqual(r.body.dentists[0].portfolio, []);
    assert.equal(r.body.reviewStats.reviewCount, 0);
    assert.ok(r.body.firstAvailableAt);
    assert.equal(r.body.trustpilot.enteredBy, "clinic");
    for (const hidden of ["cvr", "ownerId", "owner_id", "status"]) assert.equal(hidden in r.body, false, hidden);
  });

  it("giver basisprofilen for en importeret klinik uden priser, anmeldelser, beskrivelse, e-mail og tandlæger", async () => {
    const c = await newClientWithTerms();
    const r = await c.get(`/api/clinics/${importedId}?services=${EXAM.slug}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.tier, "basic");
    assert.equal(r.body.canReceiveLeads, false);
    assert.equal(r.body.description, null);
    assert.equal(r.body.email, null);
    assert.deepEqual(r.body.allPrices, []);
    assert.deepEqual(r.body.prices, []);
    assert.deepEqual(r.body.dentists, []);
    assert.equal(r.body.reviewStats, null);
    assert.equal(r.body.trustpilot.url, "https://dk.trustpilot.com/review/importeret.example.test");
    assert.equal(r.body.website, "https://example.test/importeret");
  });

  it("giver 404 for oprettede (registered), slettede (removed) og ukendte klinikker og ugyldige id'er", async () => {
    const c = await newClientWithTerms();
    for (const id of [registered.clinicId, removed.clinicId, randomUUID(), "ikke-et-id"]) {
      const r = await c.get(`/api/clinics/${id}`);
      assert.equal(r.status, 404, id);
      assert.equal(r.body.error.code, "NOT_FOUND");
    }
  });

  it("afviser ukendte behandlinger i ?services=", async () => {
    const c = await newClientWithTerms();
    assert.equal((await c.get(`/api/clinics/${clinicA.clinicId}?services=findes_ikke`)).status, 400);
  });

  it("påvirker ikke den egne forhåndsvisning på /api/clinics/me", async () => {
    const r = await clinicA.c.get("/api/clinics/me");
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "verified");
    const patient = await newClientWithTerms();
    assert.equal((await patient.get("/api/clinics/me")).status, 401);
  });
});

describe("GET /api/clinics/[id]/availability", () => {
  const range = (days: number) => {
    const from = new Date(Date.now() + 60_000);
    return `&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(new Date(from.getTime() + days * 86_400_000).toISOString())}`;
  };
  const localHour = (iso: string) =>
    Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Copenhagen", hour: "2-digit", hourCycle: "h23" }).format(new Date(iso)));

  it("giver tider på hele kvarterer med klinikkens varighed", async () => {
    const c = await newClientWithTerms();
    const r = await c.get(`/api/clinics/${clinicA.clinicId}/availability?serviceId=${EXAM.id}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const slots = r.body.slots as { startsAt: string; endsAt: string }[];
    assert.ok(slots.length > 0);
    for (const slot of slots) {
      assert.equal(Date.parse(slot.endsAt) - Date.parse(slot.startsAt), 45 * 60_000);
      assert.equal(new Date(slot.startsAt).getUTCMinutes() % 15, 0);
    }
    // En almindelig undersøgelse kun i almindelige vinduer (08:00-16:00): slutter senest 16:00 lokal.
    for (const slot of slots) assert.ok(localHour(slot.startsAt) < 16, slot.startsAt);
  });

  it("bruger katalogets varighed, når klinikken ikke har en pris for behandlingen", async () => {
    const c = await newClientWithTerms();
    const r = await c.get(`/api/clinics/${clinicB.clinicId}/availability?serviceId=${EXAM.id}`);
    assert.equal(Date.parse(r.body.slots[0].endsAt) - Date.parse(r.body.slots[0].startsAt), 30 * 60_000);
  });

  it("lader akutbehandlinger bruge akutvinduerne, som almindelige behandlinger ikke må", async () => {
    const c = await newClientWithTerms();
    const emergency = await c.get(`/api/clinics/${clinicA.clinicId}/availability?serviceId=${EMERGENCY.id}${range(3)}`);
    assert.equal(emergency.status, 200);
    assert.ok(emergency.body.slots.some((s: { startsAt: string }) => localHour(s.startsAt) >= 16));
    const regular = await c.get(`/api/clinics/${clinicA.clinicId}/availability?serviceId=${OTHER.id}${range(3)}`);
    assert.ok(regular.body.slots.every((s: { startsAt: string }) => localHour(s.startsAt) < 16));
  });

  it("udelader tider, der overlapper en blokering", async () => {
    const c = await newClientWithTerms();
    const before = await c.get(`/api/clinics/${clinicB.clinicId}/availability?serviceId=${EXAM.id}`);
    const first = before.body.slots[0] as { startsAt: string; endsAt: string };
    const block = await clinicB.c.post("/api/clinics/me/time-blocks", { startsAt: first.startsAt, endsAt: first.endsAt });
    assert.equal(block.status, 201, JSON.stringify(block.body));
    const after = await c.get(`/api/clinics/${clinicB.clinicId}/availability?serviceId=${EXAM.id}`);
    const starts = (after.body.slots as { startsAt: string }[]).map((s) => s.startsAt);
    assert.equal(starts.includes(first.startsAt), false);
    for (const slot of after.body.slots as { startsAt: string; endsAt: string }[]) {
      assert.ok(Date.parse(slot.endsAt) <= Date.parse(first.startsAt) || Date.parse(slot.startsAt) >= Date.parse(first.endsAt));
    }
    await clinicB.c.del(`/api/clinics/me/time-blocks/${block.body.id}`);
  });

  it("afviser mere end 14 dage, omvendt interval, manglende eller ukendt behandling", async () => {
    const c = await newClientWithTerms();
    const base = `/api/clinics/${clinicA.clinicId}/availability`;
    assert.equal((await c.get(`${base}?serviceId=${EXAM.id}${range(15)}`)).status, 400);
    assert.equal((await c.get(`${base}?serviceId=${EXAM.id}${range(14)}`)).status, 200);
    const from = new Date(Date.now() + 86_400_000).toISOString();
    const to = new Date(Date.now()).toISOString();
    assert.equal((await c.get(`${base}?serviceId=${EXAM.id}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)).status, 400);
    assert.equal((await c.get(base)).status, 400);
    assert.equal((await c.get(`${base}?serviceId=ikke-et-id`)).status, 400);
    assert.equal((await c.get(`${base}?serviceId=${randomUUID()}`)).status, 400);
  });

  it("giver 404 for importerede, oprettede, slettede og ukendte klinikker", async () => {
    const c = await newClientWithTerms();
    for (const id of [importedId, registered.clinicId, removed.clinicId, randomUUID()]) {
      assert.equal((await c.get(`/api/clinics/${id}/availability?serviceId=${EXAM.id}`)).status, 404, id);
    }
  });
});

describe("GET /api/clinics/[id]/reviews", () => {
  it("giver statistik og tom liste for en verificeret klinik uden anmeldelser", async () => {
    const c = await newClientWithTerms();
    const r = await c.get(`/api/clinics/${clinicA.clinicId}/reviews`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body, {
      stats: { reviewCount: 0, avgStars: null, priceAccuracyPct: null, distribution: null },
      reviews: [],
    });
  });

  it("giver 404 for ikke-verificerede klinikker: importerede, oprettede, slettede og ukendte", async () => {
    const c = await newClientWithTerms();
    for (const id of [importedId, registered.clinicId, removed.clinicId, randomUUID()]) {
      const r = await c.get(`/api/clinics/${id}/reviews`);
      assert.equal(r.status, 404, id);
    }
  });

  it("kræver vilkårs-accept", async () => {
    assert.equal((await new TestClient().get(`/api/clinics/${clinicA.clinicId}/reviews`)).status, 403);
  });
});
