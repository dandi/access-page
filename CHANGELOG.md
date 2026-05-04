# Changelog

## Upcoming

#### 📝 Documentation

- Added daily tests passing badge to `README.md`. ([#157](https://github.com/dandi/usage-page/pull/157))
- Added codecov, license, release, and code style badges to `README.md`. ([#151](https://github.com/dandi/usage-page/pull/151))

#### 🏠 Internal

- Added `--disable-gpu` to Playwright Chromium launch args to suppress GL driver GPU stall warning in CI. ([#161](https://github.com/dandi/usage-page/pull/161))
- Made `test.yml` a reusable workflow (`workflow_call`); simplified `daily-tests.yml` to call it directly (inheriting secrets for Codecov uploads); removed Playwright artifact uploads from `weekly-tests.yml`. ([#159](https://github.com/dandi/usage-page/pull/159))
- Moved `tsconfig.json` from the repository root into `configs/tsconfig.json` alongside the other config files. ([#155](https://github.com/dandi/usage-page/pull/155))
- Swapped all `src/` source files from JavaScript to TypeScript (`plots.ts`, `utils.ts`, `errors.ts`); added `tsconfig.json`, type packages (`typescript`, `@types/js-yaml`, `@types/plotly.js`, `@types/topojson-client`, `@types/node`), a `vendor.d.ts` shim for `plotly.js-dist-min`, and a `typecheck` npm script. ([#149](https://github.com/dandi/usage-page/pull/149))

#### 🚀 Enhancement

- Added "Stacked" toggle to the over-time plot settings panel to switch between stacked and overlay views when a group-by is active. ([#141](https://github.com/dandi/usage-page/pull/141))

#### 🏠 Internal

- Moved `gadm_admin1_simplified.topojson` and `name_aliases.json` from `configs/` to `src/configs/` so changes to them are covered by the version-check CI. ([#147](https://github.com/dandi/usage-page/pull/147))
- Moved `src/tests/` and `src/stories/` to top-level `tests/` and `stories/` directories to avoid confusing AI tooling and the version-check CI. ([#145](https://github.com/dandi/usage-page/pull/145))
- Replaced the hand-duplicated HTML string in `MainPage.stories.js` with a `?raw` import of `src/index.html` so the Storybook story always derives its DOM structure directly from the source. ([#143](https://github.com/dandi/usage-page/pull/143))
- Moved `gadm_admin1_simplified.topojson` and `name_aliases.json` from `public/` to `configs/` to reduce top-level noise. ([#137](https://github.com/dandi/usage-page/pull/137))
- Fixed `configs/vite.config.js` `publicDir` from `config/` to `configs/`. ([#140](https://github.com/dandi/usage-page/pull/140))
- Added weekly CI workflow (`npm-audit.yml`) that runs `npm audit` every Monday and sends an email notification on failure. ([#134](https://github.com/dandi/usage-page/pull/134))
- Added weekly CI workflow (`weekly-tests.yml`) that runs build, unit, and integration tests every Monday and sends an email notification on any failure or detected warning. ([#138](https://github.com/dandi/usage-page/pull/138))
- Added daily CI workflow (`daily-tests.yml`) that runs build, unit, and integration tests every day at noon UTC and sends an email notification on any failure or detected warning. ([#153](https://github.com/dandi/usage-page/pull/153))

#### 📝 Documentation

- Added `CHANGELOG.md` to track changes to the project.

## 🚀 Enhancement

- Modularized settings into per-plot gear panels instead of a single global modal. ([#132](https://github.com/dandi/usage-page/pull/132))
- Added line/bar plot type toggle with area shading for over-time and histogram views. ([#120](https://github.com/dandi/usage-page/pull/120))
- Respected browser `prefers-color-scheme` setting as the default light/dark theme. ([#127](https://github.com/dandi/usage-page/pull/127))
- Added version tag (bottom-left) and CON branding (bottom-right) to the page footer. ([#119](https://github.com/dandi/usage-page/pull/119))
- Added SVG export button to the Plotly modebar. ([#116](https://github.com/dandi/usage-page/pull/116))
- Stacked group-by over-time plots instead of overlaying them. ([#112](https://github.com/dandi/usage-page/pull/112))
- Added hover tooltip descriptions to asset-type legend items in the over-time plot. ([#109](https://github.com/dandi/usage-page/pull/109))
- Added "Asset type" group-by option to the over-time plot. ([#105](https://github.com/dandi/usage-page/pull/105))
- Made table column spacing dynamic. ([#96](https://github.com/dandi/usage-page/pull/96))
- Added "Group by Dandisets" overlay option for the usage over-time plot. ([#87](https://github.com/dandi/usage-page/pull/87))
- Added hover-reveal anchor links to each plot section heading. ([#85](https://github.com/dandi/usage-page/pull/85))
- Showed time aggregation controls in the table view of the over-time plot. ([#83](https://github.com/dandi/usage-page/pull/83))
- Added light/dark mode toggle with `localStorage` persistence. ([#75](https://github.com/dandi/usage-page/pull/75))
- Added daily/weekly/monthly/yearly time aggregation to the over-time bytes plot. ([#68](https://github.com/dandi/usage-page/pull/68))
- Replaced native radio buttons with a segmented pill toggle. ([#66](https://github.com/dandi/usage-page/pull/66))
- Moved source data download links into each table header. ([#65](https://github.com/dandi/usage-page/pull/65))
- Moved geographic map attributions into Plotly in-plot annotations. ([#60](https://github.com/dandi/usage-page/pull/60))
- Added logo and favicon. ([#59](https://github.com/dandi/usage-page/pull/59))
- Added plot/table view toggles with sortable columns for all sections. ([#50](https://github.com/dandi/usage-page/pull/50))
- Sorted geographic dots by size ascending and added transparency. ([#49](https://github.com/dandi/usage-page/pull/49))
- Added info icons to the settings panel to clarify the scope of each option. ([#45](https://github.com/dandi/usage-page/pull/45))
- Wrapped top-level config options into a gear wheel modal. ([#44](https://github.com/dandi/usage-page/pull/44))
- Synchronized color scheme and dark theme styling with other DANDI plugins. ([#42](https://github.com/dandi/usage-page/pull/42))
- Added a choropleth toggle for the geographic map. ([#40](https://github.com/dandi/usage-page/pull/40))
- Added exponential backoff retry logic for data fetches. ([#39](https://github.com/dandi/usage-page/pull/39))
- Synced the selected dandiset with a URL query parameter for shareable links. ([#36](https://github.com/dandi/usage-page/pull/36))
- Added AWS region histogram. ([#29](https://github.com/dandi/usage-page/pull/29))
- Added cumulative usage over-time plot. ([#11](https://github.com/dandi/usage-page/pull/11))
- Added log scale option for plots and updated the controls layout. ([#3](https://github.com/dandi/usage-page/pull/3))
- Initial deployment of the DANDI usage page with geographic map, per-dandiset breakdown, and CI/CD pipeline. ([#2](https://github.com/dandi/usage-page/pull/2))

## 🐛 Bug Fix

- Fixed page flash (FOUC) and layout scrambling on page refresh. ([#126](https://github.com/dandi/usage-page/pull/126))
- Fixed x-axis gaps in grouped dandisets cumulative plot by using global bin edges. ([#123](https://github.com/dandi/usage-page/pull/123))
- Fixed first-load race condition that caused persistent URL parameters to be ignored. ([#121](https://github.com/dandi/usage-page/pull/121))
- Disabled "Daily" aggregation when grouping by asset type. ([#115](https://github.com/dandi/usage-page/pull/115))
- Capped asset name column width to prevent table layout blowout. ([#100](https://github.com/dandi/usage-page/pull/100))
- Fixed gaps between bars in cumulative weekly/monthly over-time plots. ([#99](https://github.com/dandi/usage-page/pull/99))
- Fixed anchor navigation so the page scrolls to the correct section after all plots load. ([#98](https://github.com/dandi/usage-page/pull/98))
- Fixed anchor link flicker caused by popstate-triggered plot re-renders. ([#95](https://github.com/dandi/usage-page/pull/95))
- Disabled and hid the per-asset histogram section for the "unassociated" dandiset. ([#79](https://github.com/dandi/usage-page/pull/79))
- Hidden the histogram section entirely for the "undetermined" dandiset. ([#77](https://github.com/dandi/usage-page/pull/77))
- Held fixed section sizes when switching between plot and table views. ([#73](https://github.com/dandi/usage-page/pull/73))
- Fixed a fetch race condition. ([#39](https://github.com/dandi/usage-page/pull/39))
- Improved histogram display and fixed cumulative bar gaps and labels. ([#24](https://github.com/dandi/usage-page/pull/24), [#26](https://github.com/dandi/usage-page/pull/26))

## 🏠 Internal

- Reorganized repository layout to use Vite with a `src/` + `configs/` structure. ([#103](https://github.com/dandi/usage-page/pull/103))
- Added Google Analytics tracking. ([#101](https://github.com/dandi/usage-page/pull/101))
- Renamed section anchor IDs by stripping the `_view_controls` suffix. ([#92](https://github.com/dandi/usage-page/pull/92))
- Renamed "Bytes sent" to "Usage" throughout the UI. ([#81](https://github.com/dandi/usage-page/pull/81))
- Generalized base URLs so source data can be served from any repository. ([#67](https://github.com/dandi/usage-page/pull/67))
- Offloaded inline styles to a separate `styles.css` file. ([#48](https://github.com/dandi/usage-page/pull/48))
- Added `CNAME` file to enable the `usage.dandiarchive.org` custom domain. ([#33](https://github.com/dandi/usage-page/pull/33))
- Swapped data source base URLs to the new repository location. ([#14](https://github.com/dandi/usage-page/pull/14))

## 📝 Documentation

- Added a consolidated "Data sources" section linking to underlying data files. ([#46](https://github.com/dandi/usage-page/pull/46))
- Added a note clarifying that only public (non-embargoed) datasets are included.

## 🧪 Tests

- Set up testing infrastructure: Vitest (unit), Playwright (e2e), Storybook/Chromatic (visual), and Codecov (coverage). ([#129](https://github.com/dandi/usage-page/pull/129))
