// API-tests for placering ud fra adressen (clinics 4.3): signup og adresseændring virker uden netværk (GEOCODING_FAKE=1,
// sat af tests/api/run.sh) og giver altid koordinater. "Kortvej <n>" findes af det falske opslag; alt andet giver
// postnummerets midtpunkt.
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { PASSWORD, TestClient, adminClient, newClientWithTerms, randomCvr, uniqueEmail } from "../../../../tests/api/helpers.ts";

const admin = adminClient();
const createdUserIds = new Set<string>();

after(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id).catch(() => {});
});

type LatLng = { lat: number; lng: number };

// Samme punkt som fakeGeocodePoint() i features/clinics/fakeGeocodingService.ts.
const kortvej = (n: number): LatLng => ({ lat: 55.6761 + n / 10000, lng: 12.5683 + n / 10000 });

async function midpoint(postalCode: string): Promise<LatLng> {
  const { data, error } = await admin.from("postal_codes").select("lat, lng").eq("postal_code", postalCode).single();
  assert.equal(error, null);
  return data as LatLng;
}

function assertNear(actual: LatLng | null, expected: LatLng, message: string) {
  assert.ok(actual, `${message}: mangler placering`);
  assert.ok(Math.abs(actual.lat - expected.lat) < 1e-9 && Math.abs(actual.lng - expected.lng) < 1e-9, `${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}

async function signupClinic(address: string, postalCode = "2100", city = "København Ø"): Promise<{ c: TestClient; clinicId: string }> {
  const c = await newClientWithTerms();
  const r = await c.post("/api/auth/signup", {
    role: "clinic",
    email: uniqueEmail("klinik-kort"),
    password: PASSWORD,
    cvr: randomCvr(),
    clinicName: "Kortklinikken ApS",
    address,
    postalCode,
    city,
    phone: "00 00 00 01",
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  createdUserIds.add(r.body.userId);
  const me = await c.get("/api/clinics/me");
  assert.equal(me.status, 200);
  return { c, clinicId: me.body.id };
}

describe("klinikkens placering ud fra adressen", () => {
  it("signup med en adresse, der findes, gemmer den fundne placering (også offentligt)", async () => {
    const { c, clinicId } = await signupClinic("Kortvej 12");
    assertNear((await c.get("/api/clinics/me")).body.location, kortvej(12), "egen profil");
    const pub = await (await newClientWithTerms()).get(`/api/clinics/${clinicId}`);
    assert.equal(pub.status, 200);
    assertNear(pub.body.location, kortvej(12), "offentlig profil");
  });

  it("signup med en adresse, der ikke findes, giver postnummerets midtpunkt", async () => {
    const { c } = await signupClinic("Testvej 1", "2200", "København N");
    assertNear((await c.get("/api/clinics/me")).body.location, await midpoint("2200"), "midtpunkt");
  });

  it("ny adresse slås op; andre ændringer rører ikke placeringen; ukendt adresse giver midtpunktet", async () => {
    const { c } = await signupClinic("Testvej 1");
    let r = await c.patch("/api/clinics/me", { address: "Kortvej 30" });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assertNear(r.body.location, kortvej(30), "PATCH-svaret");
    assertNear((await c.get("/api/clinics/me")).body.location, kortvej(30), "gemt");

    r = await c.patch("/api/clinics/me", { phone: "00 00 00 02", description: "Ny beskrivelse" });
    assert.equal(r.status, 200);
    assertNear(r.body.location, kortvej(30), "uændret ved andre felter");

    r = await c.patch("/api/clinics/me", { address: "Findesikkevej 3" });
    assert.equal(r.status, 200);
    assertNear(r.body.location, await midpoint("2100"), "ukendt adresse");

    r = await c.patch("/api/clinics/me", { address: "Testvej 1", postalCode: "8000", city: "Aarhus C" });
    assert.equal(r.status, 200);
    assertNear(r.body.location, await midpoint("8000"), "nyt postnummer");
  });
});
