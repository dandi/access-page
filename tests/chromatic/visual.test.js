import { test, takeSnapshot } from "@chromatic-com/playwright";

// ── Static fixture data ──────────────────────────────────────────────────────
// All external data fetches are intercepted with these fixed values so that
// Chromatic snapshots are always taken against stable, deterministic content
// and are never affected by live data changing between runs.

const BASE_URL = "https://raw.githubusercontent.com/dandi/access-summaries/main";
const BASE_TSV_URL = `${BASE_URL}/content/summaries`;

const ARCHIVE_TOTALS = JSON.stringify({
    total_bytes_sent: 15000000000000,
    number_of_unique_regions: 150,
    number_of_unique_countries: 60,
});

const ALL_DANDISET_TOTALS = JSON.stringify({
    "000001": { total_bytes_sent: 5000000000, number_of_unique_regions: 10, number_of_unique_countries: 5 },
    "000002": { total_bytes_sent: 3000000000, number_of_unique_regions: 8, number_of_unique_countries: 4 },
    "000003": { total_bytes_sent: 1000000000, number_of_unique_regions: 5, number_of_unique_countries: 3 },
});

const REGION_COORDS_YAML = `\
US/California:
  latitude: 36.7783
  longitude: -119.4179
DE/Bavaria:
  latitude: 48.7904
  longitude: 11.4979
GB/England:
  latitude: 52.3555
  longitude: -1.1743
`;

const BY_DAY_TSV = `\
date\tbytes_sent
2024-01-01\t100000000
2024-01-02\t200000000
2024-01-03\t150000000
2024-01-04\t300000000
2024-01-05\t250000000
2024-01-06\t180000000
2024-01-07\t220000000
`;

const BY_REGION_TSV = `\
region\tbytes_sent
US/California\t5000000000
DE/Bavaria\t2000000000
GB/England\t1500000000
AWS/us-east-1\t8000000000
`;

const BY_ASSET_TSV = `\
asset\tbytes_sent
sub-001/func/sub-001_task-rest_bold.nwb\t1000000
sub-002/func/sub-002_task-rest_bold.nwb\t500000
`;

const BY_ASSET_TYPE_PER_WEEK_TSV = `\
date\tNeurophysiology\tMicroscopy\tVideo\tMiscellaneous
2024-01-01\t50000000\t30000000\t20000000\t10000000
2024-01-08\t60000000\t35000000\t25000000\t15000000
`;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Registers Playwright route handlers that intercept every external data
 * request (raw.githubusercontent.com) and respond with the static fixture
 * values above.  Must be called before page.goto().
 */
async function setupDataMocks(page) {
    await page.route(`${BASE_URL}/content/archive_totals.json`, (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: ARCHIVE_TOTALS }),
    );
    await page.route(`${BASE_URL}/content/totals.json`, (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: ALL_DANDISET_TOTALS }),
    );
    await page.route(`${BASE_URL}/content/region_codes_to_coordinates.yaml`, (route) =>
        route.fulfill({ status: 200, contentType: "text/plain", body: REGION_COORDS_YAML }),
    );
    await page.route(`${BASE_TSV_URL}/*/by_day.tsv`, (route) =>
        route.fulfill({ status: 200, contentType: "text/tab-separated-values", body: BY_DAY_TSV }),
    );
    await page.route(`${BASE_TSV_URL}/*/by_region.tsv`, (route) =>
        route.fulfill({ status: 200, contentType: "text/tab-separated-values", body: BY_REGION_TSV }),
    );
    await page.route(`${BASE_TSV_URL}/*/by_asset.tsv`, (route) =>
        route.fulfill({ status: 200, contentType: "text/tab-separated-values", body: BY_ASSET_TSV }),
    );
    await page.route(`${BASE_TSV_URL}/*/by_asset_type_per_week.tsv`, (route) =>
        route.fulfill({
            status: 200,
            contentType: "text/tab-separated-values",
            body: BY_ASSET_TYPE_PER_WEEK_TSV,
        }),
    );
}

/**
 * Waits until all three main Plotly plot sections have finished rendering.
 * Plotly adds the "js-plotly-plot" class to a div once newPlot() completes.
 */
async function waitForPlotsToRender(page) {
    await page.waitForFunction(
        () => {
            const isRendered = (id) => document.getElementById(id)?.classList.contains("js-plotly-plot");
            return isRendered("over_time_plot") && isRendered("histogram_plot") && isRendered("geography_heatmap");
        },
        { timeout: 30000 },
    );
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe("DANDI Usage Page", () => {
    test("dark theme", async ({ page }, testInfo) => {
        await setupDataMocks(page);
        await page.addInitScript(() => localStorage.setItem("theme", "dark"));
        await page.goto("/");
        await waitForPlotsToRender(page);
        await takeSnapshot(page, testInfo);
    });

    test("light theme", async ({ page }, testInfo) => {
        await setupDataMocks(page);
        await page.addInitScript(() => localStorage.setItem("theme", "light"));
        await page.goto("/");
        await waitForPlotsToRender(page);
        await takeSnapshot(page, testInfo);
    });
});
