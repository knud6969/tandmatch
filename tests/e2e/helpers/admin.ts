import { expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { PASSWORD, newPage, sql } from "./inbox";

// Admin-bruger til e2e-testene. Som scripts/create-admin.ts: signup som patient, derefter rolle admin og ingen patientrække
// (kun den LOKALE database, helpers/inbox.ts afviser andet). Sessionen fra signup bruges videre; `email` kan bruges til login.
export type AdminHandle = { page: Page; id: string; email: string };

export async function adminUser(browser: Browser, testInfo: TestInfo, label: string): Promise<AdminHandle> {
  const page = await newPage(browser, testInfo);
  const email = `e2e-admin-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const signup = await page.request.post("/api/auth/signup", { data: { role: "patient", email, password: PASSWORD, firstName: "Admin" } });
  expect(signup.status(), await signup.text()).toBe(201);
  const id = ((await signup.json()) as { userId: string }).userId;
  sql(`update public.profiles set role = 'admin' where id = '${id}'; delete from public.patients where id = '${id}'`);
  return { page, id, email };
}

export async function cleanupAdmin(admin: AdminHandle) {
  await admin.page.context().close();
  sql(`delete from auth.users where id = '${admin.id}'`);
}

// Svar fra et API-kald, som siden selv har hentet: venter på det, før siden tjekkes.
export const waitForAdminList = (page: Page, path: string) => page.waitForResponse((r) => r.url().includes(path) && r.request().method() === "GET");
