import { execFileSync } from "node:child_process";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { CONSENT_TEXT_VERSIONS } from "../../lib/constants/consents";
import { MAX_ACTIVE_LEADS_PER_CASE, MAX_TOTAL_LEADS_PER_CASE } from "../../lib/constants/limits";

// Loft på leads pr. sag (arbejdsplan 4.5b): en sag med 9 leads i alt (alle afviste, så ingen er aktive) har kun plads til ét lead mere,
// selv om der er under tre aktive. UI'et tillader derfor kun ét valg, og når det er sendt, kan sagen ikke sendes til flere.
// De ni leads lægges ind direkte i den LOKALE database (som run.sh nulstiller rate_limits i), fordi demodata kun har fire verificerede
// klinikker, og API'et ikke kan skabe afviste leads uden klinikkens svar. Klinikkerne kommer fra demodata (`npm run seed:demo`).

const PASSWORD = "test-adgangskode-123";
const DB_URL = process.env.TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const HORIZONTAL_SCROLL = () => document.documentElement.scrollWidth - document.documentElement.clientWidth;

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(HORIZONTAL_SCROLL)).toBeLessThanOrEqual(0);
}

// Kører SQL mod den lokale database. Med `replica` slås triggerne fra i sessionen (fx leads_before_insert, der kun tillader leads til
// verificerede klinikker), så et loft kan forberedes uden at oprette flere verificerede klinikker.
function sql(query: string, replica = false): string {
  if (!/^postgresql:\/\/[^@]*@(127\.0\.0\.1|localhost):/.test(DB_URL)) throw new Error("Afviser: TEST_DB_URL peger ikke på lokal database.");
  return execFileSync("psql", [DB_URL, "-At", "-q", "-c", replica ? `set session_replication_role = replica; ${query}` : query], { encoding: "utf8" }).trim();
}

async function newPatientPage(browser: Browser, testInfo: TestInfo): Promise<Page> {
  const { baseURL, viewport } = testInfo.project.use;
  const context = await browser.newContext({ baseURL, viewport, locale: "da-DK" });
  const page = await context.newPage();
  await page.goto("/klinikker");
  if (/\/vilkaar\/accepter/.test(page.url())) {
    await page.getByRole("button", { name: /Jeg accepterer vilkårene/ }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/vilkaar/accepter"));
  }
  return page;
}

async function signedUpPatientWithReadyCase(page: Page): Promise<string> {
  const email = `e2e-limit-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const signup = await page.request.post("/api/auth/signup", { data: { role: "patient", email, password: PASSWORD, firstName: "Test" } });
  expect(signup.status(), await signup.text()).toBe(201);
  const created = await page.request.post("/api/cases");
  expect(created.status()).toBe(201);
  const { id: caseId } = (await created.json()) as { id: string };
  const catalog = (await (await page.request.get("/api/services")).json()) as { groups: { services: { id: string; slug: string }[] }[] };
  const service = catalog.groups.flatMap((g) => g.services).find((s) => s.slug === "blegning")!;
  const steps = [
    page.request.put(`/api/cases/${caseId}/services`, { data: { services: [{ serviceId: service.id, suggestedByAi: false }] } }),
    page.request.patch(`/api/cases/${caseId}`, { data: { postalCode: "2100", preferredTimeframe: "within_2_weeks" } }),
    page.request.put(`/api/cases/${caseId}/summary`, { data: { summaryText: "Jeg vil gerne have lysere tænder." } }),
  ];
  for (const step of steps) expect((await step).ok()).toBeTruthy();
  const consent = await page.request.post("/api/consents", {
    data: { type: "health_data_sharing", textVersion: CONSENT_TEXT_VERSIONS.health_data_sharing },
  });
  expect(consent.status()).toBe(201);
  return caseId;
}

test.describe("loft på leads pr. sag", () => {
  test("ved 9 leads i alt kan der kun vælges og sendes til én klinik mere", async ({ browser }, testInfo) => {
    const page = await newPatientPage(browser, testInfo);
    try {
      const caseId = await signedUpPatientWithReadyCase(page);

      // Den klinik, der er tilbage, er en verificeret en. De øvrige (højst 9) får et afvist lead hver.
      const verified = sql("select id from clinics where status = 'verified' order by name limit 1");
      const others = sql(`select id from clinics where status <> 'removed' and id <> '${verified}' order by (status = 'verified') desc, name limit ${MAX_TOTAL_LEADS_PER_CASE - 1}`)
        .split("\n")
        .filter(Boolean);
      expect(others).toHaveLength(MAX_TOTAL_LEADS_PER_CASE - 1);
      for (const id of others) {
        sql(
          `insert into leads (case_id, clinic_id, status, decline_reason, responded_at) values ('${caseId}', '${id}', 'declined', 'other', now())`,
          true,
        );
      }

      const detail = (await (await page.request.get(`/api/cases/${caseId}`)).json()) as { leadCount: number; totalLeadCount: number; canSend: boolean };
      expect(detail).toMatchObject({ leadCount: 0, totalLeadCount: MAX_TOTAL_LEADS_PER_CASE - 1, canSend: true });
      expect(MAX_ACTIVE_LEADS_PER_CASE).toBeGreaterThan(1);

      // Oversigten: kun én klinik kan vælges, de øvrige viser "allerede kontaktet"
      await page.goto(`/klinikker?sag=${caseId}&services=blegning&postalCode=2100&maxDistanceKm=500&contactableOnly=false`);
      await expect(page.getByText("Vælg klinikker til din sag")).toBeVisible();
      const boxes = page.getByRole("checkbox", { name: /Vælg til kontakt/ });
      await expect(boxes).toHaveCount(1);
      await expect(page.getByText("Du har allerede kontaktet klinikken").first()).toBeVisible();
      await boxes.first().check();
      await expect(page.getByTestId("valgte-antal")).toHaveText("1 af 1 mulige klinikker valgt");
      await expectNoHorizontalScroll(page);

      // Sagen: viser, hvor mange der kan kontaktes, og et lead til den sidste klinik kan sendes
      await page.goto(`/patient/sag/${caseId}`);
      await expect(page.getByTestId("lead")).toHaveCount(MAX_TOTAL_LEADS_PER_CASE - 1);
      await expect(page.getByText("kan kontakte 1 klinik mere")).toBeVisible();
      await expectNoHorizontalScroll(page);
      const sent = await page.request.post(`/api/cases/${caseId}/leads`, { data: { clinicIds: [verified] } });
      expect(sent.status(), await sent.text()).toBe(201);

      // Nu er loftet nået: ingen "Kontakt flere klinikker", og oversigten tillader intet valg
      await page.reload();
      await expect(page.getByTestId("lead")).toHaveCount(MAX_TOTAL_LEADS_PER_CASE);
      await expect(page.getByRole("link", { name: "Kontakt flere klinikker" })).toHaveCount(0);
      await page.goto(`/klinikker?sag=${caseId}&services=blegning&postalCode=2100&maxDistanceKm=500`);
      await expect(page.getByText("Du kan ikke kontakte flere klinikker lige nu")).toBeVisible();
      await expect(boxes).toHaveCount(0);
      await expectNoHorizontalScroll(page);
    } finally {
      await page.request.delete("/api/patients/me", { data: { confirm: "SLET" } });
      await page.context().close();
    }
  });
});
