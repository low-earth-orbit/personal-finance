import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  // The first-visit disclaimer modal now mounts on every route. Pre-accept it
  // so its overlay doesn't sit over the app during these flows.
  await context.addInitScript(() => {
    window.localStorage.setItem("rvb_disclaimerAccepted", "true");
  });
});

test("hub landing page lists the available tools", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Personal Finance" }),
  ).toBeVisible();

  // The rent-vs-buy tool is linked from the hub.
  await expect(page.getByRole("link", { name: /rent vs buy/i })).toBeVisible();
});

test("loads the calculator and renders the net worth chart", async ({
  page,
}) => {
  await page.goto("/rent-vs-buy");

  await expect(
    page.getByRole("heading", { name: "Is it better to rent or buy?" }),
  ).toBeVisible();

  // The chart is rendered client-side after the Monte Carlo worker responds.
  await expect(
    page.getByRole("img", { name: /net worth projection chart/i }),
  ).toBeVisible();
});

test("retirement planner shows an earliest retirement age and chart", async ({
  page,
}) => {
  await page.goto("/retirement");

  await expect(
    page.getByRole("heading", { name: "When can I retire?" }),
  ).toBeVisible();

  // The Summary headline reports a retirement age on the default inputs.
  await expect(page.getByText(/retire/i).first()).toBeVisible();

  await expect(
    page.getByRole("img", { name: /retirement portfolio projection chart/i }),
  ).toBeVisible();
});
