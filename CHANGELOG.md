# Changelog

## Upcoming

- Added `CHANGELOG.md` to track changes to the project.

## 2026-05-03

- Modularized settings into per-plot gear panels instead of a single global modal.
- Set up testing infrastructure: Vitest (unit), Playwright (e2e), Storybook/Chromatic (visual), and Codecov (coverage).

## 2026-04-30 – 2026-05-02

- Added line/bar plot type toggle with area shading for over-time and histogram views.
- Fixed page flash (FOUC) and layout scrambling on page refresh.
- Respected browser `prefers-color-scheme` setting as the default light/dark theme.
- Fixed x-axis gaps in grouped dandisets cumulative plot by using global bin edges.

## 2026-04-29

- Fixed first-load race condition that caused persistent URL parameters to be ignored.
- Added version tag (bottom-left) and CON branding (bottom-right) to the page footer.
- Added SVG export button to the Plotly modebar.
- Disabled "Daily" aggregation when grouping by asset type.
- Stacked group-by over-time plots instead of overlaying them.
- Added hover tooltip descriptions to asset-type legend items in the over-time plot.

## 2026-04-26

- Added "Asset type" group-by option to the over-time plot.

## 2026-04-19

- Reorganized repository layout to use Vite with a `src/` + `configs/` structure.
- Added Google Analytics tracking.

## 2026-04-07

- Capped asset name column width to prevent table layout blowout.
- Fixed gaps between bars in cumulative weekly/monthly over-time plots.
- Fixed anchor navigation so the page scrolls to the correct section after all plots load.
- Made table column spacing dynamic.

## 2026-04-06

- Fixed anchor link flicker caused by popstate-triggered plot re-renders.
- Renamed section anchor IDs by stripping the `_view_controls` suffix.

## 2026-04-01

- Added "Group by Dandisets" overlay option for the usage over-time plot.

## 2026-03-23

- Added hover-reveal anchor links to each plot section heading.
- Showed time aggregation controls in the table view of the over-time plot.
- Renamed "Bytes sent" to "Usage" throughout the UI.
- Added light/dark mode toggle with `localStorage` persistence.
- Disabled and hid the per-asset histogram section for the "unassociated" dandiset.
- Hidden the histogram section entirely for the "undetermined" dandiset.
- Held fixed section sizes when switching between plot and table views.
- Added daily/weekly/monthly/yearly time aggregation to the over-time bytes plot.

## 2026-03-22

- Generalized base URLs so source data can be served from any repository.
- Replaced native radio buttons with a segmented pill toggle.
- Moved source data download links into each table header.
- Moved geographic map attributions into Plotly in-plot annotations.
- Added logo and favicon.
- Added a consolidated "Data sources" section linking to underlying data files.
- Added plot/table view toggles with sortable columns for all sections.
- Sorted geographic dots by size ascending and added transparency.
- Offloaded inline styles to a separate `styles.css` file.

## 2026-03-20

- Added info icons to the settings panel to clarify the scope of each option.
- Wrapped top-level config options into a gear wheel modal.
- Synchronized color scheme and dark theme styling with other DANDI plugins.
- Added a choropleth toggle for the geographic map.

## 2026-03-19

- Added exponential backoff retry logic for data fetches and fixed a fetch race condition.
- Synced the selected dandiset with a URL query parameter for shareable links.

## 2026-01-07

- Added `CNAME` file to enable the `usage.dandiarchive.org` custom domain.

## 2025-09-22

- Added AWS region histogram.

## 2025-07-28

- Improved histogram display and fixed cumulative bar gaps and labels.

## 2025-05-27

- Added a note clarifying that only public (non-embargoed) datasets are included.

## 2025-05-13

- Swapped data source base URLs to the new repository location.

## 2025-05-11

- Added cumulative usage over-time plot.

## 2025-05-07

- Added log scale option for plots and updated the controls layout.

## 2025-05-05

- Initial deployment of the DANDI usage page with geographic map, per-dandiset breakdown, and CI/CD pipeline.
