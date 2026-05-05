import rawHTML from "../src/index.html?raw";

export default {
    title: "DANDI Access Page/Plot Sections",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extracts the inner HTML of an element matched by `selector` from a raw HTML
 * string.  Returns an empty string if the selector finds no element.
 */
function extractSection(html, selector) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const el = doc.querySelector(selector);
    return el ? el.outerHTML : "";
}

/**
 * Extracts all elements matched by `selectors` from the raw HTML and joins
 * their outer HTML.  Useful for building multi-section previews.
 */
function extractSections(html, ...selectors) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    return selectors
        .map((sel) => {
            const el = doc.querySelector(sel);
            return el ? el.outerHTML : "";
        })
        .join("\n");
}

// ── Over-Time Plot ────────────────────────────────────────────────────────────

/**
 * Controls and empty plot/table containers for the "Usage over time" section.
 * Plot data won't load (no live network), so only the control UI is visible.
 */
const overTimeSectionHTML = extractSections(
    rawHTML,
    "#over_time",
    "#over_time_aggregate_controls",
    ".view-section:has(#over_time_plot)"
);

export const OverTimePlotDark = {
    name: "Over-Time Plot – Dark",
    render: () => {
        document.documentElement.setAttribute("data-theme", "dark");
        return overTimeSectionHTML;
    },
};

export const OverTimePlotLight = {
    name: "Over-Time Plot – Light",
    render: () => {
        document.documentElement.setAttribute("data-theme", "light");
        return overTimeSectionHTML;
    },
};

// ── Histogram Plot ────────────────────────────────────────────────────────────

/**
 * Controls and empty plot/table containers for the "Usage per Dandiset /
 * asset" histogram section.
 */
const histogramSectionHTML = extractSections(
    rawHTML,
    "#histogram",
    ".view-section:has(#histogram_plot)"
);

export const HistogramPlotDark = {
    name: "Histogram Plot – Dark",
    render: () => {
        document.documentElement.setAttribute("data-theme", "dark");
        return histogramSectionHTML;
    },
};

export const HistogramPlotLight = {
    name: "Histogram Plot – Light",
    render: () => {
        document.documentElement.setAttribute("data-theme", "light");
        return histogramSectionHTML;
    },
};

// ── Geography Section ─────────────────────────────────────────────────────────

/**
 * Controls and empty map/table containers for the geographic heatmap section.
 */
const geoSectionHTML = extractSections(
    rawHTML,
    "#geo",
    ".view-section:has(#geography_heatmap)"
);

export const GeographyPlotDark = {
    name: "Geography Plot – Dark",
    render: () => {
        document.documentElement.setAttribute("data-theme", "dark");
        return geoSectionHTML;
    },
};

export const GeographyPlotLight = {
    name: "Geography Plot – Light",
    render: () => {
        document.documentElement.setAttribute("data-theme", "light");
        return geoSectionHTML;
    },
};

// ── Sortable Table (static mock data) ────────────────────────────────────────

/**
 * A fully static sortable table rendered with mock data so it is always
 * visible in Storybook regardless of network availability.
 */
const MOCK_TABLE_HTML = `
<div id="mock_table"></div>
<script type="module">
  import { render_sortable_table } from "/src/plot-helpers.ts";
  render_sortable_table(
    "mock_table",
    "Usage per region (mock data)",
    [
      { label: "Region",    key: "region", numeric: false },
      { label: "Downloads", key: "bytes",  numeric: true  },
    ],
    [
      { region: "US/California",     bytes: 1073741824  },
      { region: "DE/Bavaria",        bytes:  536870912  },
      { region: "GB/England",        bytes:  268435456  },
      { region: "FR/Île-de-France",  bytes:  134217728  },
      { region: "JP/Tokyo",          bytes:   67108864  },
    ],
    (n) => {
      if (n >= 1e9) return (n / 1e9).toFixed(1) + " GB";
      if (n >= 1e6) return (n / 1e6).toFixed(1) + " MB";
      return n + " B";
    }
  );
</script>
`;

export const SortableTableDark = {
    name: "Sortable Table – Dark",
    render: () => {
        document.documentElement.setAttribute("data-theme", "dark");
        return MOCK_TABLE_HTML;
    },
};

export const SortableTableLight = {
    name: "Sortable Table – Light",
    render: () => {
        document.documentElement.setAttribute("data-theme", "light");
        return MOCK_TABLE_HTML;
    },
};
