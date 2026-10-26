import { expect, type Page } from "@playwright/test";

// Vilkårs-dialogen (identity 2.5): åbn den, rul teksten til bunden og accepter. Accept-knappen er spærret indtil bunden.
export async function acceptTerms(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Læs og accepter vilkårene" }).click();
  const dialog = page.getByRole("dialog", { name: "Brugervilkår og privatlivspolitik" });
  const accept = dialog.getByRole("button", { name: /^Jeg accepterer vilkårene/ });
  await expect(accept).toBeDisabled();
  await dialog.getByTestId("vilkaar-tekst").evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(accept).toBeEnabled();
  await accept.click();
}
