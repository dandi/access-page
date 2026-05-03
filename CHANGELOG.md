# Changelog

## Upcoming

#### 📝 Documentation

- Added `CHANGELOG.md` to track changes to the project.

## 🚀 Enhancement

- Modularized settings into per-plot gear panels instead of a single global modal.
- Added line/bar plot type toggle with area shading for over-time and histogram views.
- Respected browser `prefers-color-scheme` setting as the default light/dark theme.
- Added version tag (bottom-left) and CON branding (bottom-right) to the page footer.
- Added SVG export button to the Plotly modebar.
- Stacked group-by over-time plots instead of overlaying them.
- Added hover tooltip descriptions to asset-type legend items in the over-time plot.
- Added "Asset type" group-by option to the over-time plot.
- Made table column spacing dynamic.
- Added "Group by Dandisets" overlay option for the usage over-time plot.
- Added hover-reveal anchor links to each plot section heading.
- Showed time aggregation controls in the table view of the over-time plot.
- Added light/dark mode toggle with `localStorage` persistence.
- Added daily/weekly/monthly/yearly time aggregation to the over-time bytes plot.
- Replaced native radio buttons with a segmented pill toggle.
- Moved source data download links into each table header.
- Moved geographic map attributions into Plotly in-plot annotations.
- Added logo and favicon.
- Added plot/table view toggles with sortable columns for all sections.
- Sorted geographic dots by size ascending and added transparency.
- Added info icons to the settings panel to clarify the scope of each option.
- Wrapped top-level config options into a gear wheel modal.
- Synchronized color scheme and dark theme styling with other DANDI plugins.
- Added a choropleth toggle for the geographic map.
- Added exponential backoff retry logic for data fetches.
- Synced the selected dandiset with a URL query parameter for shareable links.
- Added AWS region histogram.
- Added cumulative usage over-time plot.
- Added log scale option for plots and updated the controls layout.
- Initial deployment of the DANDI usage page with geographic map, per-dandiset breakdown, and CI/CD pipeline.

## 🐛 Bug Fix

- Fixed page flash (FOUC) and layout scrambling on page refresh.
- Fixed x-axis gaps in grouped dandisets cumulative plot by using global bin edges.
- Fixed first-load race condition that caused persistent URL parameters to be ignored.
- Disabled "Daily" aggregation when grouping by asset type.
- Capped asset name column width to prevent table layout blowout.
- Fixed gaps between bars in cumulative weekly/monthly over-time plots.
- Fixed anchor navigation so the page scrolls to the correct section after all plots load.
- Fixed anchor link flicker caused by popstate-triggered plot re-renders.
- Disabled and hid the per-asset histogram section for the "unassociated" dandiset.
- Hidden the histogram section entirely for the "undetermined" dandiset.
- Held fixed section sizes when switching between plot and table views.
- Fixed a fetch race condition.
- Improved histogram display and fixed cumulative bar gaps and labels.

## 🏠 Internal

- Reorganized repository layout to use Vite with a `src/` + `configs/` structure.
- Added Google Analytics tracking.
- Renamed section anchor IDs by stripping the `_view_controls` suffix.
- Renamed "Bytes sent" to "Usage" throughout the UI.
- Generalized base URLs so source data can be served from any repository.
- Offloaded inline styles to a separate `styles.css` file.
- Added `CNAME` file to enable the `usage.dandiarchive.org` custom domain.
- Swapped data source base URLs to the new repository location.

## 📝 Documentation

- Added a consolidated "Data sources" section linking to underlying data files.
- Added a note clarifying that only public (non-embargoed) datasets are included.

## 🧪 Tests

- Set up testing infrastructure: Vitest (unit), Playwright (e2e), Storybook/Chromatic (visual), and Codecov (coverage).
