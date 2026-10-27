import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
test("inspect examples, switch request types and export a real report", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "SOL example", exact: true }).click();
  await expect(page.getByTestId("verdict")).toHaveText(
    "No structural errors found",
  );
  await expect(page.getByTestId("amount")).toHaveText("0.01 SOL");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  expect((await download).suggestedFilename()).toBe("paylint-report.json");
  await page
    .getByRole("button", { name: "Transaction link", exact: true })
    .click();
  await expect(page.getByTestId("endpoint")).toContainText("example.com");
  await expect(
    page.getByText("Endpoint was not fetched.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Malformed example", exact: true })
    .click();
  await expect(page.getByTestId("verdict")).toHaveText(
    "Malformed or unsupported request",
  );
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("local QR upload decodes and inspects without uploading the image", async ({
  page,
}) => {
  await page.goto("/");
  const external: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:4461/")) external.push(r.url());
  });
  await page
    .getByLabel("QR image")
    .setInputFiles(
      fileURLToPath(new URL("../fixtures/sol-pay.png", import.meta.url)),
    );
  await expect(page.getByTestId("amount")).toHaveText("0.01 SOL");
  await expect(page.getByTestId("label")).toHaveText("QR example");
  expect(external).toEqual([]);
});
test("metadata is rendered as text and failures can recover", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Solana Pay URL")
    .fill(
      "solana:mvines9iiHiQTysrwkJjGf2gb9Ex9jXJX8ns3qwf2kN?label=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E",
    );
  await page
    .getByRole("button", { name: "Inspect request", exact: true })
    .click();
  await expect(page.getByTestId("label")).toHaveText(
    "<img src=x onerror=alert(1)>",
  );
  expect(await page.locator("#result img").count()).toBe(0);
  await page.getByLabel("Solana Pay URL").fill("bad");
  await page
    .getByRole("button", { name: "Inspect request", exact: true })
    .click();
  await expect(page.getByTestId("verdict")).toHaveText(
    "Malformed or unsupported request",
  );
  await page.getByRole("button", { name: "SOL example", exact: true }).click();
  await expect(page.getByTestId("amount")).toHaveText("0.01 SOL");
});
