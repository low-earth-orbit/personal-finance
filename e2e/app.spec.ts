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
    page.getByRole("heading", { level: 1, name: "The numbers behind the big decisions." }),
  ).toBeVisible();

  // The rent-vs-buy tool is linked from the hub.
  await expect(page.getByRole("link", { name: /rent vs buy/i })).toBeVisible();
});

test("allocator requires input review before showing the split", async ({ page }) => {
  await page.goto("/allocator");

  await expect(
    page.getByRole("heading", {
      name: "Where to invest: TFSA, RRSP or Non-Reg?",
    }),
  ).toBeVisible();
  await expect(page.getByText("Review your numbers first")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Invest about/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Show split" }).click();
  await expect(page.getByRole("heading", { name: "Invest about $50,000" })).toBeVisible();
  await expect(page.getByText("Why this split")).toBeVisible();
  await expect(page.getByText("Model limits")).toBeVisible();

  await page.getByLabel("Lump sum to invest now").fill("51000");
  await expect(page.getByRole("heading", { name: "Invest about $50,000" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Invest about $51,000" })).toBeVisible();

  await page.getByRole("link", { name: "Review detailed assumptions" }).click();
  await expect(page).toHaveURL(/#model-assumptions$/);
  await expect(page.locator("#model-assumptions details")).toHaveAttribute("open", "");
});

test("loads the calculator and renders the net worth chart", async ({ page }) => {
  await page.goto("/rent-vs-buy");

  await expect(page.getByRole("heading", { name: "Is it better to rent or buy?" })).toBeVisible();

  // The chart is rendered client-side after the Monte Carlo worker responds.
  await expect(page.getByRole("img", { name: /net worth projection chart/i })).toBeVisible();
});

test("retirement planner shows an earliest retirement age and chart", async ({ page }) => {
  await page.goto("/retirement");

  await expect(page.getByRole("heading", { name: "When can I retire?" })).toBeVisible();

  // The Summary headline reports a retirement age on the default inputs.
  await expect(page.getByText(/retire/i).first()).toBeVisible();

  await expect(
    page.getByRole("img", { name: /retirement portfolio projection chart/i }),
  ).toBeVisible();
});

test("swr shows the safe withdrawal rate table", async ({ page }) => {
  await page.goto("/swr");

  await expect(page.getByRole("heading", { name: "Safe withdrawal rates" })).toBeVisible();
  const table = page.getByRole("table");
  await expect(table).toBeVisible();
  await expect(table.getByRole("row").filter({ hasText: "60/40" })).toBeVisible();
});

test("lifetime allocation generates a recommendation under both return models", async ({
  page,
}) => {
  // Two optimizer runs in a dev-mode worker; allow for a slow CI machine.
  test.setTimeout(120_000);
  await page.goto("/glide-path");

  await expect(page.getByRole("heading", { name: "Lifetime Allocation" })).toBeVisible();

  const generate = page.getByRole("button", { name: "Generate allocation paths" });
  await generate.click();
  await expect(page.getByText(/preferred allocation/i)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("img", { name: /equity weight by age/i })).toBeVisible();
  await expect(page.getByText(/IID normal draws from the forward-CMA/)).toBeVisible();

  // Switching the return model marks the result stale until it is generated again.
  await page.getByRole("button", { name: "Simulation", exact: true }).click();
  await page.getByText("Historical sequences", { exact: true }).click();
  await expect(page.getByText(/Inputs changed/)).toBeVisible();

  await generate.click();
  await expect(page.getByText(/stationary block bootstrap from JST Macrohistory/)).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(/Inputs changed/)).toHaveCount(0);
});

test("expected return tool recomputes from user inputs", async ({ page }) => {
  await page.goto("/expected-return");

  await expect(page.getByRole("heading", { name: "Expected stock returns" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "4.2% a year" })).toBeVisible();
  await expect(page.getByRole("table", { name: /By region and view/ })).toBeVisible();

  await page.getByRole("textbox", { name: "CAPE half-life" }).fill("100");
  await expect(page.getByRole("heading", { name: "4.4% a year" })).toBeVisible();
});
