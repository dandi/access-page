import { test, takeSnapshot } from "@chromatic-com/playwright";

async function setTheme(page, theme) {
    await page.evaluate((t) => {
        document.documentElement.setAttribute("data-theme", t);
        localStorage.setItem("theme", t);
    }, theme);
}

test.describe("DANDI Usage Page", () => {
    test("dark theme", async ({ page }, testInfo) => {
        await page.goto("/");
        await setTheme(page, "dark");
        await takeSnapshot(page, testInfo);
    });

    test("light theme", async ({ page }, testInfo) => {
        await page.goto("/");
        await setTheme(page, "light");
        await takeSnapshot(page, testInfo);
    });
});
