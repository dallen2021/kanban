import { expect, test } from "@playwright/test";

test("renders mission control shell", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("heading", { name: "Kanbanana Webview" })).toBeVisible();
});
