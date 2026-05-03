import { handlePlotlyError } from "./errors.js";
import {
    setUrlParam,
    color_with_alpha,
    parse_by_day_tsv,
    parse_by_asset_type_per_week_tsv,
    aggregate_by_timebin,
    format_bytes as format_bytes_pure,
} from "./utils.js";
import { load as loadYaml } from "js-yaml";
import Plotly from "plotly.js-dist-min";
import { feature as topojsonFeature } from "topojson-client";

// ── Theme helpers (mirrors :root CSS variables in styles.css) ───────────────
const DARK_THEME = {
    bg:            '#1a1a2e',
    surface:       '#16213e',
    border:        '#2a2a4a',
    text:          '#e0e0e0',
    textSecondary: '#a0a0b0',
    accent:        '#53a8b6',
    mapStyle:      'carto-darkmatter',
    annotationBg:  'rgba(22, 33, 62, 0.7)',
};

const LIGHT_THEME = {
    bg:            '#f5f7fa',
    surface:       '#ffffff',
    border:        '#d1d9e0',
    text:          '#1a1a2e',
    textSecondary: '#5a6580',
    accent:        '#53a8b6',
    mapStyle:      'carto-positron',
    annotationBg:  'rgba(245, 247, 250, 0.85)',
};

// Media query used to detect the OS / browser dark-mode preference.
const PREFERS_DARK_MQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

// Tracks whether the page is currently in dark mode; initialised from
// localStorage (or browser preference) in initTheme() on DOMContentLoaded.
let IS_DARK_MODE = true;

/** Returns the active theme colour object. */
function getTheme() {
    return IS_DARK_MODE ? DARK_THEME : LIGHT_THEME;
}

/**
 * Mutates `layout` in-place to apply the current theme colours and returns it.
 * Axis overrides are merged so callers can still add axis-specific options.
 */
function applyTheme(layout) {
    const theme = getTheme();
    layout.paper_bgcolor = theme.surface;
    layout.plot_bgcolor  = theme.surface;
    layout.font = Object.assign({ color: theme.text }, layout.font || {});

    const axisDefaults = {
        gridcolor:     theme.border,
        linecolor:     theme.border,
        zerolinecolor: theme.border,
        tickfont:      { color: theme.textSecondary },
        titlefont:     { color: theme.textSecondary },
    };
    if (layout.xaxis) Object.assign(layout.xaxis, { ...axisDefaults, ...layout.xaxis });
    if (layout.yaxis) Object.assign(layout.yaxis, { ...axisDefaults, ...layout.yaxis });
    return layout;
}

// ── Shared Plotly config ─────────────────────────────────────────────────────
// Replaces the default PNG camera button with a paired group containing both
// PNG and SVG download buttons, keeping them side-by-side in the modebar.
const PLOTLY_CONFIG = {
    modeBarButtonsToRemove: ['toImage'],
    modeBarButtonsToAdd: [
        [
            {
                name: 'Download plot as PNG',
                icon: Plotly.Icons.camera,
                click: function (gd) {
                    Plotly.downloadImage(gd, { format: 'png', filename: gd.id || 'dandi-plot' });
                },
            },
            {
                name: 'Download plot as SVG',
                icon: {
                    // Material Design "file_download" arrow icon
                    width: 24,
                    height: 24,
                    path: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
                },
                click: function (gd) {
                    Plotly.downloadImage(gd, { format: 'svg', filename: gd.id || 'dandi-plot' });
                },
            },
        ],
    ],
};

/**
 * Reads the saved theme preference from localStorage.  When no preference has
 * been saved yet, falls back to the browser / OS setting via
 * `prefers-color-scheme`.  Applies the resolved theme to the <html> element,
 * updates IS_DARK_MODE, and registers a media-query listener so the page
 * automatically follows OS theme changes as long as the user has not chosen an
 * explicit override.
 * Call once on page load before any plots are rendered.
 *
 * NOTE: The defaulting logic (anything other than 'light' → dark) must stay
 * in sync with the inline anti-FOUC script in index.html <head>.
 */
function initTheme() {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') {
        IS_DARK_MODE = saved === 'dark';
    } else {
        IS_DARK_MODE = PREFERS_DARK_MQ ? PREFERS_DARK_MQ.matches : true;
    }
    document.documentElement.setAttribute('data-theme', IS_DARK_MODE ? 'dark' : 'light');
    syncThemeToggleIcon();

    // When no explicit preference is stored, keep in sync with OS theme changes.
    if (PREFERS_DARK_MQ) {
        PREFERS_DARK_MQ.addEventListener('change', (e) => {
            if (localStorage.getItem('theme')) return; // user override takes precedence
            IS_DARK_MODE = e.matches;
            document.documentElement.setAttribute('data-theme', IS_DARK_MODE ? 'dark' : 'light');
            syncThemeToggleIcon();
        });
    }
}

/**
 * Flips the active theme, persists it to localStorage, updates the <html>
 * attribute, and re-renders all visible plots so they adopt the new colours.
 */
function toggleTheme() {
    IS_DARK_MODE = !IS_DARK_MODE;
    const theme = IS_DARK_MODE ? 'dark' : 'light';
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    syncThemeToggleIcon();

    // Re-render all plots with the new theme colours
    const selector = document.getElementById('dandiset_selector');
    if (selector) {
        const id = selector.value;
        load_over_time_plot(id);
        load_histogram(id);
        load_aws_histogram(id);
        load_geographic_heatmap(id);
    }
}

/** Updates the toggle button icon to reflect the current theme. */
function syncThemeToggleIcon() {
    const btn = document.getElementById('theme_toggle_btn');
    if (!btn) return;
    if (IS_DARK_MODE) {
        // Currently dark → clicking will switch to light → show sun icon
        btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-13a1 1 0 0 0 1-1V2a1 1 0 1 0-2 0v1a1 1 0 0 0 1 1zm0 14a1 1 0 0 0-1 1v1a1 1 0 1 0 2 0v-1a1 1 0 0 0-1-1zm10-5a1 1 0 0 0 0-2h-1a1 1 0 1 0 0 2h1zM3 12a1 1 0 0 0-1-1H1a1 1 0 1 0 0 2h1a1 1 0 0 0 1-1zm15.36-6.36a1 1 0 0 0 0-1.41l-.71-.71a1 1 0 0 0-1.41 1.41l.71.71a1 1 0 0 0 1.41 0zM6.05 17.95a1 1 0 0 0-1.41 0l-.71.71a1 1 0 1 0 1.41 1.41l.71-.71a1 1 0 0 0 0-1.41zm12.02 2.12-.71-.71a1 1 0 0 0-1.41 1.41l.71.71a1 1 0 0 0 1.41-1.41zM5.34 5.64a1 1 0 0 0-1.41-1.41l-.71.71a1 1 0 1 0 1.41 1.41l.71-.71z"/></svg>';
        btn.setAttribute('aria-label', 'Switch to light mode');
        btn.setAttribute('title', 'Switch to light mode');
    } else {
        // Currently light → clicking will switch to dark → show moon icon
        btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>';
        btn.setAttribute('aria-label', 'Switch to dark mode');
        btn.setAttribute('title', 'Switch to dark mode');
    }
}
// ────────────────────────────────────────────────────────────────────────────

/**
 * Shows or hides the "Group by" control for the over-time plot, and
 * shows/hides the "Dandisets" option based on whether the archive is selected.
 * When a non-archive dandiset is selected, the "Dandisets" option is hidden and
 * any active "dandisets" group-by is reset to "none".
 * The whole control is hidden when the table view is active.
 */
function apply_over_time_group_by_visibility() {
    const container = document.getElementById("over_time_group_by_container");
    if (!container) return;
    container.style.display = !USE_OVER_TIME_TABLE ? "" : "none";

    const selector = document.getElementById("dandiset_selector");
    const isArchive = !selector || selector.value === "archive";
    const dandisets_option = document.querySelector('#over_time_group_by option[value="dandisets"]');
    if (dandisets_option) {
        dandisets_option.hidden = !isArchive;
    }

    // If "dandisets" was selected but a non-archive dandiset is now active, reset to "none"
    const groupBySelector = document.getElementById("over_time_group_by");
    if (!isArchive && groupBySelector && groupBySelector.value === "dandisets") {
        groupBySelector.value = "none";
        OVER_TIME_GROUP_BY = "none";
    }
}

/**
 * Disables the 'Daily' aggregation radio button when grouping by 'asset type',
 * because the underlying data is only available at weekly granularity.
 * If 'Daily' is currently selected, it is automatically switched to 'Weekly'.
 */
function apply_daily_aggregation_restriction() {
    const daily_radio = document.getElementById("aggregation_daily");
    const daily_label = document.querySelector('label[for="aggregation_daily"]');
    if (!daily_radio) return;

    const restrict = OVER_TIME_GROUP_BY === "asset_type";
    daily_radio.disabled = restrict;
    if (daily_label) {
        daily_label.title = restrict
            ? "Daily data is not available when grouping by asset type"
            : "";
    }

    if (restrict && TIME_AGGREGATION === "daily") {
        TIME_AGGREGATION = "weekly";
        const weekly_radio = document.getElementById("aggregation_weekly");
        if (weekly_radio) weekly_radio.checked = true;
    }
}

/**
 * Toggles visibility between a Plotly plot element and its paired table element.
 * Before switching, the enclosing `.view-section` wrapper's current rendered
 * height is stored as its `min-height`, so elements further down the page do
 * not jump when a shorter view replaces a taller one.  The value is refreshed
 * on every call (including each dandiset reload), so it tracks the most recent
 * fully-rendered plot height and does not accumulate across view switches.
 *
 * @param {string} plot_id - ID of the plot container element.
 * @param {string} table_id - ID of the table container element.
 * @param {boolean} use_table - When true, shows the table and hides the plot.
 */
function apply_view_mode(plot_id, table_id, use_table) {
    const plot_el = document.getElementById(plot_id);
    const table_el = document.getElementById(table_id);

    const section_el = plot_el && plot_el.closest('.view-section');
    if (section_el) {
        if (use_table) {
            // Switching to table: lock the current (plot) height so elements below
            // don't jump while the table renders.
            const current_height = section_el.offsetHeight;
            if (current_height > 0) {
                section_el.style.minHeight = current_height + 'px';
            }
        } else {
            // Switching back to plot: release the lock so the section shrinks back
            // to the plot's natural height and doesn't leave an empty gap below.
            section_el.style.minHeight = '';
        }
    }

    if (plot_el) plot_el.style.display = use_table ? "none" : "";
    if (table_el) table_el.style.display = use_table ? "" : "none";
}

function apply_geo_view_mode(view) {
    const mapEl   = document.getElementById("geography_heatmap");
    const tableEl = document.getElementById("geo_table_section");
    const showMap = (view === "regions" || view === "points");

    // Lock the section height before switching to prevent layout shift on elements below
    const section_el = mapEl && mapEl.closest('.view-section');
    if (section_el) {
        if (!showMap) {
            // Switching to table: lock the current (map) height so elements below
            // don't jump while the table renders.
            const current_height = section_el.offsetHeight;
            if (current_height > 0) {
                section_el.style.minHeight = current_height + 'px';
            }
        } else {
            // Switching back to map: release the lock so the section returns to its
            // natural height and doesn't leave an empty gap below.
            section_el.style.minHeight = '';
        }
    }

    if (mapEl)   mapEl.style.display   = showMap ? "" : "none";
    if (tableEl) tableEl.style.display = showMap ? "none" : "";
    // When showing a table, hide the one that isn't selected
    const regionsEl = document.getElementById("top_regions_table");
    const awsEl     = document.getElementById("aws_histogram");
    if (regionsEl) regionsEl.style.display = (view === "table") ? "" : "none";
    if (awsEl)     awsEl.style.display     = (view === "aws")   ? "" : "none";
}
// ────────────────────────────────────────────────────────────────────────────

/**
 * Renders a sortable HTML table inside a container element.
 * Clicking a column header re-sorts the table in place and updates the sort
 * indicator (▲ ascending / ▼ descending / ⇅ unsorted).
 *
 * @param {string} container_id - ID of the container element.
 * @param {string} title - Heading text rendered above the table.
 * @param {Array<{label: string, key: string, numeric: boolean}>} columns
 *        Column definitions.  `numeric: true` formats the cell value with
 *        `format_bytes()`; otherwise the raw value is displayed as-is.
 * @param {Array<Object>} rows - Data rows (plain objects keyed by column.key).
 * @param {string} [data_url] - Optional URL to the source data file; when
 *        provided a "Data" hyperlink is rendered top-right in the table header.
 */
function render_sortable_table(container_id, title, columns, rows, data_url) {
    const container = document.getElementById(container_id);
    if (!container) return;

    // Default: sort by the last column (bytes) descending
    // sort_asc: true = ascending (A→Z / low→high), false = descending (Z→A / high→low)
    let sort_key = columns[columns.length - 1].key;
    let sort_asc  = false; // start descending so highest values appear first

    function render_table() {
        const sorted = [...rows].sort((a, b) => {
            const va = a[sort_key];
            const vb = b[sort_key];
            const factor = sort_asc ? 1 : -1;
            if (typeof va === "number" && typeof vb === "number") {
                return factor * (va - vb);
            }
            // Numeric-aware locale comparison handles Dandiset IDs like "000123"
            return factor * String(va).localeCompare(String(vb), undefined, { numeric: true });
        });

        const data_link = data_url
            ? `<a class="table-data-link" href="${data_url}" target="_blank" rel="noopener">Data</a>`
            : "";
        let html = `<div class="plot-table-header"><h3>${title}</h3>${data_link}</div>`;
        html += '<div class="plot-table-container"><table><thead><tr>';
        columns.forEach((col) => {
            const is_sorted = col.key === sort_key;
            const indicator = is_sorted ? (sort_asc ? "▲" : "▼") : "⇅";
            const cls = is_sorted ? "th-sorted" : "th-sortable";
            html += `<th class="${cls}" data-key="${col.key}">${col.label} <span class="sort-indicator">${indicator}</span></th>`;
        });
        html += "</tr></thead><tbody>";
        sorted.forEach((row) => {
            html += "<tr>";
            columns.forEach((col) => {
                const val = col.numeric ? format_bytes(row[col.key]) : row[col.key];
                html += `<td>${val}</td>`;
            });
            html += "</tr>";
        });
        html += "</tbody></table></div>";
        container.innerHTML = html;

        // Attach sort click handlers after innerHTML is set
        container.querySelectorAll("th[data-key]").forEach((th) => {
            th.addEventListener("click", () => {
                const key = th.dataset.key;
                if (key === sort_key) {
                    sort_asc = !sort_asc;
                } else {
                    sort_key = key;
                    sort_asc  = false; // first click on a new column → descending (high→low)
                }
                render_table();
            });
        });
    }

    render_table();
}
// ────────────────────────────────────────────────────────────────────────────

// Initialise the theme and URL-driven state as early as possible (before plots
// are rendered) so that CSS variables, global flags, and form controls are all
// in sync from the very first paint.  syncFromUrl() is called here instead of
// inside the window "load" handler so it always runs before any async data
// fetch can resolve and trigger the first plot render.
document.addEventListener("DOMContentLoaded", () => {
    initTheme();

    // Set the version tag in the footer
    const versionEl = document.getElementById("site_version");
    if (versionEl) {
        versionEl.textContent = `v${__APP_VERSION__}`;
    }

    // Sync global state and form controls from URL parameters early so that
    // when the data fetch Promise resolves and plots are rendered for the first
    // time, the correct settings (cumulative, group_by, etc.) are already in
    // effect.
    syncFromUrl();

    // Remove the 'preload' class added by the inline <head> script so that CSS
    // transitions are re-enabled for all subsequent user interactions (theme
    // toggle, settings changes, etc.).  Using rAF ensures the class is removed
    // after the browser has committed the initial paint with the correct state.
    window.requestAnimationFrame(() => {
        document.documentElement.classList.remove('preload');
    });
});

// Handle section anchor link clicks: update the URL hash via pushState so the
// address bar reflects the section link, but without triggering a popstate
// event (which would re-render all plots and cause visible flicker).
// Then manually scroll to the target element so the anchor behaves like a
// normal in-page link.
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".section-anchor").forEach((anchor) => {
        anchor.addEventListener("click", (e) => {
            e.preventDefault();
            const href = anchor.getAttribute("href");
            window.history.pushState(null, "", href);
            document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
        });
    });
});

// Fetch with exponential backoff retry logic
/**
 * Fetches a URL with automatic retries using exponential backoff.
 * Only retries on transient failures: network errors or 5xx server errors.
 * Permanent client errors (4xx) are thrown immediately without retrying.
 *
 * @param {string} url - The URL to fetch.
 * @param {RequestInit} [options={}] - Optional fetch options.
 * @param {number} [maxRetries=4] - Maximum number of retry attempts.
 * @param {number} [baseDelay=1000] - Base delay in milliseconds; doubles on each retry (1 s, 2 s, 4 s, 8 s).
 * @returns {Promise<Response>} Resolves with the successful Response.
 * @throws {Error} After all retries are exhausted, or immediately on a non-retryable error.
 */
async function fetchWithRetry(url, options = {}, maxRetries = 4, baseDelay = 1000) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        let response;
        try {
            response = await fetch(url, options);
        } catch (networkError) {
            // Network failure — always retryable
            if (attempt === maxRetries) {
                throw networkError;
            }
            const delay = baseDelay * Math.pow(2, attempt);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
        }

        if (response.ok) {
            return response;
        }

        // 4xx errors are permanent; do not retry
        if (response.status < 500) {
            throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
        }

        // 5xx errors are transient; retry with backoff
        if (attempt === maxRetries) {
            throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
        }
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
    }
}

// URLs for fetching data
// When forking this repo for a different deployment, update BASE_URL to point at the new data repository.
const BASE_URL = "https://raw.githubusercontent.com/dandi/access-summaries/main";
const BASE_TSV_URL = `${BASE_URL}/content/summaries`;

const ARCHIVE_TOTALS_URL = `${BASE_URL}/content/archive_totals.json`;
const ALL_DANDISET_TOTALS_URL = `${BASE_URL}/content/totals.json`;
const REGION_CODES_TO_LATITUDE_LONGITUDE_URL = `${BASE_URL}/content/region_codes_to_coordinates.yaml`;

let REGION_CODES_TO_LATITUDE_LONGITUDE = {};
let ALL_DANDISET_TOTALS = {};
let USE_LOG_SCALE = false;
let USE_CUMULATIVE = false;
let USE_LINE_PLOT = false;
let USE_BINARY = false;
let GEO_VIEW = "regions";  // "regions" | "points" | "table" | "aws"
let TIME_AGGREGATION = "daily";  // "daily" | "weekly" | "monthly" | "yearly"
let OVER_TIME_GROUP_BY = "none";  // "none" | "dandisets"
let TOP_N_DANDISETS = 8;
let USE_OVER_TIME_TABLE = false;
let USE_HISTOGRAM_TABLE = false;
let GEOJSON_DATA = null;
let NAME_ALIASES = null;



/**
 * Reads all URL parameters and synchronises them to the global state variables
 * and UI elements, without triggering any plot reloads.  Call this on initial
 * load and whenever the browser navigates back/forward.
 */
function syncFromUrl() {
    const params = new URLSearchParams(window.location.search);

    // Log scale
    const logScaleCheckbox = document.getElementById("log_scale");
    if (logScaleCheckbox) {
        USE_LOG_SCALE = params.get("log") === "true";
        logScaleCheckbox.checked = USE_LOG_SCALE;
    }

    // Cumulative
    const cumulativeCheckbox = document.getElementById("cumulative");
    if (cumulativeCheckbox) {
        USE_CUMULATIVE = params.get("cumulative") === "true";
        cumulativeCheckbox.checked = USE_CUMULATIVE;
    }

    // Plot type (bar vs line) — shared by both over-time and histogram plot settings
    USE_LINE_PLOT = params.get("plot_type") === "line";
    const plotTypeValue = USE_LINE_PLOT ? "line" : "bar";
    const otPlotTypeSelect = document.getElementById("ot_plot_type");
    if (otPlotTypeSelect) otPlotTypeSelect.value = plotTypeValue;
    const histPlotTypeSelect = document.getElementById("hist_plot_type");
    if (histPlotTypeSelect) histPlotTypeSelect.value = plotTypeValue;

    // Prefix (binary vs decimal)
    const prefixSelector = document.getElementById("prefix");
    if (prefixSelector) {
        USE_BINARY = params.get("prefix") === "binary";
        prefixSelector.value = USE_BINARY ? "binary" : "decimal";
    }

    // Geo view
    const urlMap = params.get("map");
    const validGeoViews = ["regions", "points", "table", "aws"];
    GEO_VIEW = validGeoViews.includes(urlMap) ? urlMap : "regions";
    const geoRadio = document.querySelector(`input[name="geo_view"][value="${GEO_VIEW}"]`);
    if (geoRadio) geoRadio.checked = true;
    apply_geo_view_mode(GEO_VIEW);

    // Over-time view (plot vs table)
    USE_OVER_TIME_TABLE = params.get("over_time") === "table";
    const overTimeValue = USE_OVER_TIME_TABLE ? "table" : "plot";
    const overTimeRadio = document.querySelector(`input[name="over_time_view"][value="${overTimeValue}"]`);
    if (overTimeRadio) overTimeRadio.checked = true;
    apply_view_mode("over_time_plot", "over_time_table", USE_OVER_TIME_TABLE);
    apply_over_time_group_by_visibility();
    const validAggregations = ["daily", "weekly", "monthly", "yearly"];
    const urlAggregation = params.get("aggregation");
    TIME_AGGREGATION = validAggregations.includes(urlAggregation) ? urlAggregation : "daily";
    const aggregationRadio = document.querySelector(`input[name="time_aggregation"][value="${TIME_AGGREGATION}"]`);
    if (aggregationRadio) aggregationRadio.checked = true;

    // Over-time group by
    const groupBySelector = document.getElementById("over_time_group_by");
    if (groupBySelector) {
        const urlGroupBy = params.get("group_by");
        OVER_TIME_GROUP_BY = ["none", "dandisets", "asset_type"].includes(urlGroupBy) ? urlGroupBy : "none";
        groupBySelector.value = OVER_TIME_GROUP_BY;
    }
    apply_daily_aggregation_restriction();

    // Top N dandisets
    const topNInput = document.getElementById("top_n_dandisets");
    if (topNInput) {
        const urlTopN = parseInt(params.get("top_n"), 10);
        TOP_N_DANDISETS = (!isNaN(urlTopN) && urlTopN >= 1) ? urlTopN : 8;
        topNInput.value = TOP_N_DANDISETS;
    }

    // Histogram view (plot vs table)
    USE_HISTOGRAM_TABLE = params.get("histogram") === "table";
    const histogramValue = USE_HISTOGRAM_TABLE ? "table" : "plot";
    const histogramRadio = document.querySelector(`input[name="histogram_view"][value="${histogramValue}"]`);
    if (histogramRadio) histogramRadio.checked = true;
    apply_view_mode("histogram_plot", "histogram_table", USE_HISTOGRAM_TABLE);
}

/**
 * Wires up open/close behaviour for a settings panel (gear wheel).
 * Clicking the button toggles the panel; clicking outside or pressing Escape
 * closes it.
 */
function setupSettingsPanel(btnId, panelId) {
    const btn = document.getElementById(btnId);
    const panel = document.getElementById(panelId);
    if (!btn || !panel) return;

    btn.addEventListener("click", function (e) {
        e.stopPropagation();
        const isOpen = panel.classList.toggle("open");
        btn.setAttribute("aria-expanded", String(isOpen));
        panel.setAttribute("aria-hidden", String(!isOpen));
    });
    document.addEventListener("click", function (e) {
        if (!panel.contains(e.target) && !btn.contains(e.target)) {
            panel.classList.remove("open");
            btn.setAttribute("aria-expanded", "false");
            panel.setAttribute("aria-hidden", "true");
        }
    });
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
            panel.classList.remove("open");
            btn.setAttribute("aria-expanded", "false");
            panel.setAttribute("aria-hidden", "true");
        }
    });
}

// Check if Plotly is loaded after the window loads
window.addEventListener("load", () => {
    if (typeof Plotly === "undefined") {
        handlePlotlyError();
    }

    // Theme toggle button
    const themeToggleBtn = document.getElementById("theme_toggle_btn");
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener("click", toggleTheme);
    }

    // Settings panels (gear wheels) open/close
    setupSettingsPanel("settings_btn", "settings_panel");
    setupSettingsPanel("ot_settings_btn", "ot_settings_panel");
    setupSettingsPanel("hist_settings_btn", "hist_settings_panel");

    // Add event listener for log scale checkbox
    const logScaleCheckbox = document.getElementById("log_scale");
    if (logScaleCheckbox) {
        logScaleCheckbox.addEventListener("change", function() {
            USE_LOG_SCALE = this.checked;

            const params = new URLSearchParams(window.location.search);
            setUrlParam(params, "log", String(USE_LOG_SCALE), "false");
            const query = params.toString();
            window.history.pushState({}, "", window.location.pathname + (query ? "?" + query : ""));

            // Get the current dandiset ID
            const dandiset_selector = document.getElementById("dandiset_selector");
            const selected_dandiset = dandiset_selector.value;

            // Reload plots with the current dandiset ID
            load_over_time_plot(selected_dandiset);
            load_histogram(selected_dandiset);
            load_aws_histogram(selected_dandiset);
            load_geographic_heatmap(selected_dandiset);
        });
    }

    // Add event listener for cumulative totals
    const cumulativeCheckbox = document.getElementById("cumulative");
    if (cumulativeCheckbox) {
        cumulativeCheckbox.addEventListener("change", function () {
            USE_CUMULATIVE = this.checked;

            const params = new URLSearchParams(window.location.search);
            if (this.checked) {
                params.set("cumulative", "true");
            } else {
                params.delete("cumulative");
            }
            const query = params.toString();
            const newUrl = window.location.pathname + (query ? "?" + query : "");
            window.history.pushState({}, "", newUrl);

            // Get the current dandiset ID
            const dandiset_selector = document.getElementById("dandiset_selector");
            const selected_dandiset = dandiset_selector.value;

            // Reload plots with the current dandiset ID
            load_over_time_plot(selected_dandiset);
            load_histogram(selected_dandiset);
            load_aws_histogram(selected_dandiset);
            load_geographic_heatmap(selected_dandiset);
        });
    }

    // Add event listener for plot type toggle (bar vs line) — shared by over-time and histogram
    // Both selects control the same USE_LINE_PLOT state and are kept in sync with each other.
    const otPlotTypeSelect = document.getElementById("ot_plot_type");
    const histPlotTypeSelect = document.getElementById("hist_plot_type");

    function onPlotTypeChange(newValue) {
        USE_LINE_PLOT = newValue === "line";

        // Sync the other select
        if (otPlotTypeSelect) otPlotTypeSelect.value = newValue;
        if (histPlotTypeSelect) histPlotTypeSelect.value = newValue;

        const params = new URLSearchParams(window.location.search);
        setUrlParam(params, "plot_type", newValue, "bar");
        const query = params.toString();
        const newUrl = window.location.pathname + (query ? "?" + query : "");
        window.history.pushState({}, "", newUrl);

        // Get the current dandiset ID
        const dandiset_selector = document.getElementById("dandiset_selector");
        const selected_dandiset = dandiset_selector.value;

        // Reload affected plots
        load_over_time_plot(selected_dandiset);
        load_histogram(selected_dandiset);
    }

    if (otPlotTypeSelect) {
        otPlotTypeSelect.addEventListener("change", function () {
            onPlotTypeChange(this.value);
        });
    }

    if (histPlotTypeSelect) {
        histPlotTypeSelect.addEventListener("change", function () {
            onPlotTypeChange(this.value);
        });
    }

    // Add event listener for binary/decimal toggle
    const prefix_selector = document.getElementById("prefix");
    if (prefix_selector) {
        prefix_selector.addEventListener("change", function () {
            USE_BINARY = this.value === "binary";

            const params = new URLSearchParams(window.location.search);
            setUrlParam(params, "prefix", this.value, "decimal");
            const query = params.toString();
            window.history.pushState({}, "", window.location.pathname + (query ? "?" + query : ""));

            // Get the current dandiset ID
            const dandiset_selector = document.getElementById("dandiset_selector");
            const selected_dandiset = dandiset_selector.value;

            // Reload plots with the current dandiset ID
            update_totals(selected_dandiset);
            load_over_time_plot(selected_dandiset);
            load_histogram(selected_dandiset);
            load_aws_histogram(selected_dandiset);
            load_geographic_heatmap(selected_dandiset);
        });
    }

    // Add event listener for over-time view radio toggle (Plot vs Table)
    const overTimeViewRadios = document.querySelectorAll('input[name="over_time_view"]');
    overTimeViewRadios.forEach((radio) => {
        radio.addEventListener("change", function () {
            USE_OVER_TIME_TABLE = this.value === "table";

            const params = new URLSearchParams(window.location.search);
            setUrlParam(params, "over_time", this.value, "plot");
            const query = params.toString();
            window.history.pushState({}, "", window.location.pathname + (query ? "?" + query : ""));

            apply_view_mode("over_time_plot", "over_time_table", USE_OVER_TIME_TABLE);
            apply_over_time_group_by_visibility();
        });
    });

    // Add event listener for histogram view radio toggle (Plot vs Table)
    const histogramViewRadios = document.querySelectorAll('input[name="histogram_view"]');
    histogramViewRadios.forEach((radio) => {
        radio.addEventListener("change", function () {
            USE_HISTOGRAM_TABLE = this.value === "table";

            const params = new URLSearchParams(window.location.search);
            setUrlParam(params, "histogram", this.value, "plot");
            const query = params.toString();
            window.history.pushState({}, "", window.location.pathname + (query ? "?" + query : ""));

            apply_view_mode("histogram_plot", "histogram_table", USE_HISTOGRAM_TABLE);
        });
    });

    // Add event listener for time aggregation radio toggle (Daily / Weekly / Monthly / Yearly)
    const timeAggregationRadios = document.querySelectorAll('input[name="time_aggregation"]');
    timeAggregationRadios.forEach((radio) => {
        radio.addEventListener("change", function () {
            TIME_AGGREGATION = this.value;

            const params = new URLSearchParams(window.location.search);
            setUrlParam(params, "aggregation", TIME_AGGREGATION, "daily");
            const query = params.toString();
            window.history.pushState({}, "", window.location.pathname + (query ? "?" + query : ""));

            const selected_dandiset = document.getElementById("dandiset_selector").value;
            load_over_time_plot(selected_dandiset);
        });
    });

    // Add event listener for the single geo view toggle (Regions / Dots / Table / AWS)
    const geoViewRadios = document.querySelectorAll('input[name="geo_view"]');
    geoViewRadios.forEach((radio) => {
        radio.addEventListener("change", function () {
            GEO_VIEW = this.value;

            const params = new URLSearchParams(window.location.search);
            setUrlParam(params, "map", GEO_VIEW, "regions");
            const query = params.toString();
            window.history.pushState({}, "", window.location.pathname + (query ? "?" + query : ""));

            apply_geo_view_mode(GEO_VIEW);

            const selected_dandiset = document.getElementById("dandiset_selector").value;
            // Re-render the map only when a map mode is selected
            if (GEO_VIEW === "regions" || GEO_VIEW === "points") {
                load_geographic_heatmap(selected_dandiset);
            }
        });
    });

    // Add event listener for over-time group-by selector
    const groupBySelector = document.getElementById("over_time_group_by");
    if (groupBySelector) {
        groupBySelector.addEventListener("change", function () {
            OVER_TIME_GROUP_BY = this.value;
            apply_daily_aggregation_restriction();

            const params = new URLSearchParams(window.location.search);
            setUrlParam(params, "group_by", OVER_TIME_GROUP_BY, "none");
            setUrlParam(params, "aggregation", TIME_AGGREGATION, "daily");
            const query = params.toString();
            window.history.pushState({}, "", window.location.pathname + (query ? "?" + query : ""));

            const selected_dandiset = document.getElementById("dandiset_selector").value;
            load_over_time_plot(selected_dandiset);
        });
    }

    // Add event listener for top-N dandisets setting
    const topNInput = document.getElementById("top_n_dandisets");
    if (topNInput) {
        topNInput.addEventListener("change", function () {
            const val = parseInt(this.value, 10);
            TOP_N_DANDISETS = (!isNaN(val) && val >= 1) ? val : 8;
            this.value = TOP_N_DANDISETS;

            const params = new URLSearchParams(window.location.search);
            setUrlParam(params, "top_n", String(TOP_N_DANDISETS), "8");
            const query = params.toString();
            window.history.pushState({}, "", window.location.pathname + (query ? "?" + query : ""));

            if (OVER_TIME_GROUP_BY === "dandisets") {
                const selected_dandiset = document.getElementById("dandiset_selector").value;
                load_over_time_plot(selected_dandiset);
            }
        });
    }
});

// Add an event listener for window resize
window.addEventListener("resize", resizePlots);

function resizePlots() {
    const plotIds = ["over_time_plot", "histogram_plot", "aws_histogram", "geography_heatmap"];
    plotIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el && el.data) {
            Plotly.Plots.resize(el);
        }
    });

    // Update min zoom for the choroplethmap based on new width
    const mapEl = document.getElementById("geography_heatmap");
    if (mapEl && GEO_VIEW === "regions" && mapEl._fullLayout && mapEl._fullLayout.map && mapEl._fullLayout.map._subplot) {
        const mapWidth = mapEl.offsetWidth;
        const defaultZoom = Math.max(1, Math.log2(mapWidth / 512));
        const minZoom = defaultZoom - 0.15;
        const map = mapEl._fullLayout.map._subplot.map;
        if (map && map.setMinZoom) {
            map.setMinZoom(minZoom);
        }
    }
}



fetchWithRetry(REGION_CODES_TO_LATITUDE_LONGITUDE_URL)
    .then((response) => response.text())
    .then((data) => {
        REGION_CODES_TO_LATITUDE_LONGITUDE = loadYaml(data);
    })
    .catch((error) => {
        console.error("Error loading YAML file:", error);
    });

// Both archive totals and dandiset totals are fetched in parallel, but the dropdown
// and initial plots are only rendered once BOTH have resolved. This prevents a race
// condition where update_totals("archive") is called before ALL_DANDISET_TOTALS["archive"]
// has been populated.
const archiveTotalsPromise = fetchWithRetry(ARCHIVE_TOTALS_URL)
    .then((response) => response.text())
    .then((archive_totals_text) => {
        ALL_DANDISET_TOTALS["archive"] = JSON.parse(archive_totals_text);
    })
    .catch((error) => {
        console.error("Error:", error);

        const totals_element = document.getElementById("totals");
        if (totals_element) {
            totals_element.innerText = "Failed to load data for archive totals.";
        }
    });

const allDandisetTotalsPromise = fetchWithRetry(ALL_DANDISET_TOTALS_URL)
    .then((response) => response.text())
    .then((all_dandiset_totals_text) => {
        Object.assign(ALL_DANDISET_TOTALS, JSON.parse(all_dandiset_totals_text));
    })
    .catch((error) => {
        console.error("Error:", error);
        throw error; // Propagate so Promise.all rejects and its .catch() renders the error message
    });

// Populate the dropdown with IDs and render initial plots only after both fetches complete
Promise.all([archiveTotalsPromise, allDandisetTotalsPromise])
    .then(() => {
        // Re-sync from URL here as a safety net: if DOMContentLoaded fired
        // before the data was ready, the global state is already correct, but
        // if (in edge cases such as Service Worker caching) the fetch resolved
        // before DOMContentLoaded, this call ensures the URL-driven settings
        // are applied before any plot is rendered for the first time.
        syncFromUrl();

        let dandiset_ids = Object.keys(ALL_DANDISET_TOTALS);
        dandiset_ids.sort((a, b) => {
            if (a === "archive") return -1;
            if (b === "archive") return 1;
            // Compare as numbers if both are numeric
            const aNum = Number(a);
            const bNum = Number(b);
            if (!isNaN(aNum) && !isNaN(bNum)) {
                return aNum - bNum;
            }
            // Fallback to string comparison
            return a.localeCompare(b);
        });

        const selector = document.getElementById("dandiset_selector");

        if (!selector) {
            throw new Error("Dropdown element not found on main page.");
        }

        dandiset_ids.forEach((id) => {
            const option = document.createElement("option");
            option.value = id;
            option.textContent = id;
            selector.appendChild(option);
        });

        // Normalize a raw dandiset ID to a valid selection, falling back to "archive"
        const validateDandisetId = (raw) => (raw && dandiset_ids.includes(raw) ? raw : "archive");

        // Update the selector and reload all plots/totals for the given dandiset ID
        const setSelectedDandiset = (rawId) => {
            const id = validateDandisetId(rawId);
            selector.value = id;
            apply_over_time_group_by_visibility();
            update_totals(id);
            return [
                load_over_time_plot(id),
                load_histogram(id),
                load_aws_histogram(id),
                load_geographic_heatmap(id),
            ];
        };

        // Check URL for a dandiset parameter and load initial plots
        const urlParams = new URLSearchParams(window.location.search);
        const initialHash = window.location.hash;
        const initialPromises = setSelectedDandiset(urlParams.get("dandiset"));

        // Once all initial plots have rendered, re-scroll to the URL hash anchor so
        // that async data loading (which expands the page) doesn't leave the user at
        // the wrong scroll position.  Use allSettled so the scroll still happens even
        // if one or more plots fail to load.
        if (initialHash) {
            Promise.allSettled(initialPromises.map(p => p ?? Promise.resolve())).then(() => {
                const target = document.querySelector(initialHash);
                if (target) target.scrollIntoView({ behavior: "instant" });
            });
        }

        // Update the plots and URL when a new Dandiset ID is selected
        selector.addEventListener("change", (event) => {
            const id = event.target.value;
            const params = new URLSearchParams(window.location.search);
            if (id === "archive") {
                params.delete("dandiset");
            } else {
                params.set("dandiset", id);
            }
            const query = params.toString();
            const newUrl = window.location.pathname + (query ? "?" + query : "");
            window.history.pushState({}, "", newUrl);
            setSelectedDandiset(id);
        });

        // Handle browser back/forward navigation
        window.addEventListener("popstate", () => {
            const params = new URLSearchParams(window.location.search);
            syncFromUrl();
            setSelectedDandiset(params.get("dandiset"));
        });
    })
    .catch((error) => {
        console.error("Error:", error);

        // Only overlay error message over first plot element
        const over_time_plot_element = document.getElementById("over_time_plot");
        if (over_time_plot_element) {
            over_time_plot_element.innerText = "Failed to load Dandiset IDs and populate default plots.";
        }
    });

// Function to display scalar totals
function update_totals(dandiset_id) {
    const totals_element_id = "totals";
    const totals_element = document.getElementById(totals_element_id);
    const totals = ALL_DANDISET_TOTALS[dandiset_id];  // Include 'archive' as a special key

    try {
        const human_readable_bytes_sent = format_bytes(totals.total_bytes_sent);
        const header = `A total of ${human_readable_bytes_sent} was used by ${totals.number_of_unique_regions} regions across ${totals.number_of_unique_countries} countries. <sup>*</sup>`;
        totals_element.innerHTML = dandiset_id === "unassociated"
            ? header + `<br>However, the usage could not be associated with any Dandiset.<br>This can occur if a previously uploaded file was replaced prior to publication.`
            : dandiset_id === "undetermined"
                ? header + `<br>However, the usage could not be uniquely associated with a particular Dandiset.<br>This can occur if the same file exists within more than one Dandiset at a time.`
                : header

        // Add the footnote
        const footnote = document.createElement("div");
        footnote.style.fontSize = "0.5em";
        footnote.style.marginTop = "7px";
        footnote.innerHTML = "<sup>*</sup> These values are only estimates for publicly released datasets and are subject to change as additional information becomes available.";
        totals_element.appendChild(footnote);
    } catch (error) {
        console.error("Error:", error);
        if (totals_element) {
            totals_element.innerText = "Failed to load totals.";
        }
    }
}

// Abbreviated descriptions shown as tooltip text on legend items when the
// over-time plot is grouped by asset type.
const ASSET_TYPE_DESCRIPTIONS = {
    Neurophysiology: "NWB files",
    Microscopy:      "OME-Zarr, NIfTI, TIFF",
    Video:          "AVI, MKV, MP4, MOV, WMV",
    Miscellaneous:      "TXT, TSV, JSON, code, etc.",
};

// Categorical colour palette for the "group by Dandisets" overlay bars.
// Colours include 0.7 alpha so overlapping bars remain visible.
const DANDISET_BAR_COLORS = [
    "rgba(88,174,192,0.7)",
    "rgba(255,152,0,0.7)",
    "rgba(76,175,80,0.7)",
    "rgba(229,57,53,0.7)",
    "rgba(156,39,176,0.7)",
    "rgba(233,30,99,0.7)",
    "rgba(0,188,212,0.7)",
    "rgba(205,220,57,0.7)",
    "rgba(255,87,34,0.7)",
    "rgba(63,81,181,0.7)",
    "rgba(0,150,136,0.7)",
    "rgba(255,193,7,0.7)",
    "rgba(96,125,139,0.7)",
    "rgba(33,150,243,0.7)",
    "rgba(139,195,74,0.7)",
    "rgba(171,71,188,0.7)",
    "rgba(121,85,72,0.7)",
    "rgba(0,230,118,0.7)",
    "rgba(244,67,54,0.7)",
    "rgba(3,169,244,0.7)",
];

/**
 * Adds SVG <title> tooltip elements to Plotly legend items whose display name
 * appears in `label_to_tooltip`.  Attaches to the plotly_afterplot event so
 * tooltips survive redraws (theme switches, resizes, trace toggles, etc.).
 *
 * @param {string} plot_element_id - ID of the Plotly graph div.
 * @param {Object} label_to_tooltip - Map of legend label → tooltip string.
 */
function attach_legend_tooltips(plot_element_id, label_to_tooltip) {
    const el = document.getElementById(plot_element_id);
    if (!el) return;

    function inject_titles() {
        el.querySelectorAll(".legendtext").forEach((text_el) => {
            const desc = label_to_tooltip[text_el.textContent];
            if (!desc) return;
            const group = text_el.closest(".traces");
            if (!group) return;
            // Replace any stale title so re-renders always have the correct text.
            const existing = group.querySelector("title");
            if (existing) existing.remove();
            const title_el = document.createElementNS("http://www.w3.org/2000/svg", "title");
            title_el.textContent = desc;
            group.appendChild(title_el);
        });
    }

    inject_titles();
    // `el.on()` is Plotly's own event-emitter API (added to the graph div by
    // Plotly.newPlot); it is the documented way to subscribe to plotly_* events.
    el.on("plotly_afterplot", inject_titles);
}

/**
 * Builds the shared layout options used by both single-series and grouped
 * over-time plots.
 */
function build_over_time_layout(dates) {
    const tick_formats = {
        daily:   "%Y-%m-%d",
        weekly:  "%Y-%m-%d",
        monthly: "%Y-%m",
        yearly:  "%Y",
    };
    const per_bin_titles = {
        daily:   "Usage per day",
        weekly:  "Usage per week",
        monthly: "Usage per month",
        yearly:  "Usage per year",
    };

    const layout = applyTheme({
        bargap: 0,
        title: {
            text: USE_CUMULATIVE ? "Total usage to date" : per_bin_titles[TIME_AGGREGATION],
            font: { size: 24 }
        },
        xaxis: {
            tickformat: tick_formats[TIME_AGGREGATION],
        },
        yaxis: {
            type: USE_LOG_SCALE ? "log" : "linear",
            tickformat: USE_LOG_SCALE ? "" : "s",
            ticksuffix: USE_LOG_SCALE ? "" : "B",
            tickvals: USE_LOG_SCALE ? [1000, 1000000, 1000000000, 1000000000000, 1000000000000000] : null,
            ticktext: USE_LOG_SCALE ? ["KB", "MB", "GB", "TB", "PB"] : null,
        },
    });

    // For cumulative views, remove range gaps so the display is continuous
    if (USE_CUMULATIVE && dates.length > 0) {
        if (TIME_AGGREGATION === "daily") {
            const date_set = new Set(dates);
            const date_objects = dates.map(d => new Date(d + "T00:00:00Z"));
            const min_date = new Date(Math.min(...date_objects));
            const max_date = new Date(Math.max(...date_objects));
            const all_dates = [];
            for (let d = new Date(min_date); d <= max_date; d.setDate(d.getDate() + 1)) {
                all_dates.push(d.toISOString().slice(0, 10));
            }
            layout.xaxis.rangebreaks = [{ values: all_dates.filter(d => !date_set.has(d)) }];
        } else if (TIME_AGGREGATION === "weekly") {
            // dates are "YYYY-MM-DD" (Mondays); keep only those, remove all other days
            const week_set = new Set(dates);
            const date_objects = dates.map(d => new Date(d + "T00:00:00Z"));
            const min_date = new Date(Math.min(...date_objects));
            const max_date = new Date(Math.max(...date_objects));
            // Extend to end of last week (Sunday)
            const end_date = new Date(max_date);
            end_date.setUTCDate(end_date.getUTCDate() + 6);
            const all_days = [];
            for (let d = new Date(min_date); d <= end_date; d.setUTCDate(d.getUTCDate() + 1)) {
                all_days.push(d.toISOString().slice(0, 10));
            }
            layout.xaxis.rangebreaks = [{ values: all_days.filter(d => !week_set.has(d)) }];
        } else if (TIME_AGGREGATION === "monthly") {
            // dates are "YYYY-MM" (month bin keys); map to "YYYY-MM-01" for Date operations
            const month_starts = new Set(dates.map(d => d + "-01"));
            const date_objects = dates.map(d => new Date(d + "-01T00:00:00Z"));
            const min_date = new Date(Math.min(...date_objects));
            const max_date = new Date(Math.max(...date_objects));
            // Extend to last day of the final month
            const end_date = new Date(max_date);
            end_date.setUTCMonth(end_date.getUTCMonth() + 1);
            end_date.setUTCDate(0);
            const all_days = [];
            for (let d = new Date(min_date); d <= end_date; d.setUTCDate(d.getUTCDate() + 1)) {
                all_days.push(d.toISOString().slice(0, 10));
            }
            layout.xaxis.rangebreaks = [{ values: all_days.filter(d => !month_starts.has(d)) }];
        }
    }

    return layout;
}

/**
 * Applies cumulative transform to an array of byte counts.
 */
function make_cumulative(bytes_sent) {
    return bytes_sent.reduce((acc, value, index) => {
        acc.push((acc[index - 1] || 0) + value);
        return acc;
    }, []);
}

// Function to fetch and render the over time for a given Dandiset ID
function load_over_time_plot(dandiset_id) {
    const plot_element_id = "over_time_plot";

    // Clear any locked height from the previous dandiset to avoid a stale gap
    const over_time_el = document.getElementById(plot_element_id);
    const section_el = over_time_el && over_time_el.closest('.view-section');
    if (section_el) section_el.style.minHeight = "";

    // ── Grouped mode: overlay asset types ────────────────────────────────────
    if (OVER_TIME_GROUP_BY === "asset_type") {
        const tsv_url = `${BASE_TSV_URL}/${dandiset_id}/by_asset_type_per_week.tsv`;
        const archive_tsv_url = `${BASE_TSV_URL}/${dandiset_id}/by_day.tsv`;

        const asset_type_promise = fetch(tsv_url)
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.text();
            });
        const archive_promise = fetch(archive_tsv_url)
            .then((r) => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))
            .then((text) => parse_by_day_tsv(text))
            .catch(() => null);

        return Promise.all([asset_type_promise, archive_promise])
            .then(([text, archive_data]) => {
                const { dates: raw_dates, asset_types, series_map } = parse_by_asset_type_per_week_tsv(text);

                // Data is weekly; treat "daily" aggregation as weekly since no finer data exists
                const effective_aggregation = TIME_AGGREGATION === "daily" ? "weekly" : TIME_AGGREGATION;

                const bin_label_prefix = {
                    weekly: "Week of ", monthly: "Month: ", yearly: "Year: ",
                }[effective_aggregation];

                const all_dates_for_layout = [];

                const plot_info = asset_types.map((type, i) => {
                    const raw_bytes = series_map.get(type);
                    const agg = aggregate_by_timebin(raw_dates, raw_bytes, effective_aggregation);
                    const plot_data = USE_CUMULATIVE ? make_cumulative(agg.bytes_sent) : agg.bytes_sent;
                    const human_readable = plot_data.map((b) => format_bytes(b));
                    const color = DANDISET_BAR_COLORS[i % DANDISET_BAR_COLORS.length];
                    all_dates_for_layout.push(...agg.dates);
                    return {
                        ...(USE_LINE_PLOT
                            ? { type: "scatter", mode: "lines", line: { color }, stackgroup: "one" }
                            : { type: "bar", marker: { color } }),
                        name: type,
                        x: agg.dates,
                        y: plot_data,
                        text: agg.dates.map((date, idx) =>
                            `${type}<br>${bin_label_prefix}${date}<br>${human_readable[idx]}`
                        ),
                        textposition: "none",
                        hoverinfo: "text",
                    };
                });

                // Build an "Other" series: archive total minus the sum of all asset types
                if (archive_data) {
                    const archive_agg = aggregate_by_timebin(archive_data.dates, archive_data.bytes, effective_aggregation);
                    const archive_plot_data = USE_CUMULATIVE
                        ? make_cumulative(archive_agg.bytes_sent)
                        : archive_agg.bytes_sent;
                    // Build per-date lookup for the sum of all asset-type series
                    const series_by_date = new Map();
                    for (const series of plot_info) {
                        series.x.forEach((date, idx) => {
                            series_by_date.set(date, (series_by_date.get(date) || 0) + series.y[idx]);
                        });
                    }
                    const other_y = archive_agg.dates.map((date, i) => {
                        const asset_type_total = series_by_date.get(date) || 0;
                        return Math.max(0, archive_plot_data[i] - asset_type_total);
                    });
                    const other_human_readable = other_y.map((b) => format_bytes(b));
                    plot_info.push({
                        ...(USE_LINE_PLOT
                            ? { type: "scatter", mode: "lines", line: { color: "rgba(150,150,150,0.7)" }, stackgroup: "one" }
                            : { type: "bar", marker: { color: "rgba(150,150,150,0.7)" } }),
                        name: "Undetermined file types",
                        x: archive_agg.dates,
                        y: other_y,
                        text: archive_agg.dates.map((date, idx) =>
                            `Undetermined file types<br>${bin_label_prefix}${date}<br>${other_human_readable[idx]}`
                        ),
                        textposition: "none",
                        hoverinfo: "text",
                    });
                    all_dates_for_layout.push(...archive_agg.dates);
                }

                const unique_dates = [...new Set(all_dates_for_layout)].sort();
                const layout = build_over_time_layout(unique_dates);
                if (!USE_LINE_PLOT) layout.barmode = "stack";
                layout.showlegend = true;
                layout.legend = { title: { text: "Asset type" } };

                // Override title for "daily" since we show weekly granularity
                if (!USE_LINE_PLOT && TIME_AGGREGATION === "daily") {
                    layout.title.text = "Usage per week";
                }

                Plotly.newPlot(plot_element_id, plot_info, layout, PLOTLY_CONFIG);
                attach_legend_tooltips(plot_element_id, ASSET_TYPE_DESCRIPTIONS);

                // Table: show total bytes per time bin (sum across all asset types)
                const total_bytes = raw_dates.map((_, i) =>
                    asset_types.reduce((sum, type) => sum + (series_map.get(type)[i] || 0), 0)
                );
                const agg_total = aggregate_by_timebin(raw_dates, total_bytes, effective_aggregation);
                const combined = agg_total.dates.map((date, i) => ({ date, bytes: agg_total.bytes_sent[i] }));
                const per_bin_titles = {
                    weekly: "Usage per week",
                    monthly: "Usage per month", yearly: "Usage per year",
                };
                const date_col_labels = {
                    weekly: "Week of", monthly: "Month", yearly: "Year",
                };
                render_sortable_table("over_time_table", per_bin_titles[effective_aggregation], [
                    { label: date_col_labels[effective_aggregation], key: "date", numeric: false },
                    { label: "Usage", key: "bytes", numeric: true },
                ], combined, tsv_url);

                apply_view_mode(plot_element_id, "over_time_table", USE_OVER_TIME_TABLE);
            })
            .catch((error) => {
                console.error("Error in asset type grouped over-time plot:", error);
                const plot_element = document.getElementById(plot_element_id);
                if (plot_element) {
                    plot_element.innerText = "Failed to load data for asset type grouped plot.";
                }
            });
    }

    // ── Grouped mode: overlay top-N dandisets (archive view only) ────────────
    if (OVER_TIME_GROUP_BY === "dandisets" && dandiset_id === "archive") {
        const top_dandiset_ids = Object.entries(ALL_DANDISET_TOTALS)
            .filter(([id]) => id !== "archive" && id !== "undetermined" && id !== "unassociated")
            .sort((a, b) => b[1].total_bytes_sent - a[1].total_bytes_sent)
            .slice(0, TOP_N_DANDISETS)
            .map(([id]) => id);

        const bin_label_prefix = {
            daily: "", weekly: "Week of ", monthly: "Month: ", yearly: "Year: ",
        }[TIME_AGGREGATION];

        const per_series_promises = top_dandiset_ids.map((id) =>
            fetch(`${BASE_TSV_URL}/${id}/by_day.tsv`)
                .then((r) => {
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    return r.text();
                })
                .then((text) => {
                    const { dates: raw_dates, bytes: raw_bytes } = parse_by_day_tsv(text);
                    const agg = aggregate_by_timebin(raw_dates, raw_bytes, TIME_AGGREGATION);
                    return { id, dates: agg.dates, bytes_sent: agg.bytes_sent };
                })
                .catch((err) => {
                    console.warn(`Skipping dandiset ${id} in grouped view:`, err);
                    return null;
                })
        );

        // Also fetch the archive's by_day.tsv for the table view
        const archive_tsv_url = `${BASE_TSV_URL}/archive/by_day.tsv`;
        const archive_promise = fetch(archive_tsv_url)
            .then((r) => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))
            .then((text) => parse_by_day_tsv(text))
            .catch(() => null);

        return Promise.all([Promise.all(per_series_promises), archive_promise])
            .then(([series_results, archive_data]) => {
                const valid_series = series_results.filter(Boolean);

                // Compute global bin edges: union of all dandiset bins and archive bins.
                // Aligning every series to the same x-axis eliminates gaps between bars
                // that would otherwise appear when dandisets have different date ranges.
                const global_bin_set = new Set(valid_series.flatMap((s) => s.dates));
                let archive_agg = null;
                if (archive_data) {
                    archive_agg = aggregate_by_timebin(archive_data.dates, archive_data.bytes, TIME_AGGREGATION);
                    archive_agg.dates.forEach((d) => global_bin_set.add(d));
                }
                const global_bins = [...global_bin_set].sort();

                const plot_info = valid_series.map((series, i) => {
                    const color = DANDISET_BAR_COLORS[i % DANDISET_BAR_COLORS.length];
                    const date_to_bytes = new Map(series.dates.map((d, idx) => [d, series.bytes_sent[idx]]));
                    const aligned_bytes = global_bins.map((k) => date_to_bytes.get(k) || 0);
                    const plot_data = USE_CUMULATIVE ? make_cumulative(aligned_bytes) : aligned_bytes;
                    const human_readable = plot_data.map((b) => format_bytes(b));
                    return {
                        ...(USE_LINE_PLOT
                            ? { type: "scatter", mode: "lines", line: { color }, stackgroup: "one" }
                            : { type: "bar", marker: { color } }),
                        name: `DANDI:${series.id}`,
                        x: global_bins,
                        y: plot_data,
                        text: global_bins.map((date, idx) =>
                            `DANDI:${series.id}<br>${bin_label_prefix}${date}<br>${human_readable[idx]}`
                        ),
                        textposition: "none",
                        hoverinfo: "text",
                    };
                });

                // Build an "Other" series: archive total minus the sum of all top-N dandisets
                if (archive_agg) {
                    const date_to_archive_bytes = new Map(
                        archive_agg.dates.map((d, i) => [d, archive_agg.bytes_sent[i]])
                    );
                    const aligned_archive_bytes = global_bins.map((k) => date_to_archive_bytes.get(k) || 0);
                    const archive_plot_data = USE_CUMULATIVE
                        ? make_cumulative(aligned_archive_bytes)
                        : aligned_archive_bytes;
                    // Build per-date lookup for the sum of top-N series (already cumulative if USE_CUMULATIVE)
                    const series_by_date = new Map();
                    for (const trace of plot_info) {
                        trace.x.forEach((date, idx) => {
                            series_by_date.set(date, (series_by_date.get(date) || 0) + trace.y[idx]);
                        });
                    }
                    const other_y = global_bins.map((date, i) => {
                        const top_n_total = series_by_date.get(date) || 0;
                        return Math.max(0, archive_plot_data[i] - top_n_total);
                    });
                    const other_human_readable = other_y.map((b) => format_bytes(b));
                    plot_info.push({
                        ...(USE_LINE_PLOT
                            ? { type: "scatter", mode: "lines", line: { color: "rgba(150,150,150,0.7)" }, stackgroup: "one" }
                            : { type: "bar", marker: { color: "rgba(150,150,150,0.7)" } }),
                        name: "Other",
                        x: global_bins,
                        y: other_y,
                        text: global_bins.map((date, idx) =>
                            `Other<br>${bin_label_prefix}${date}<br>${other_human_readable[idx]}`
                        ),
                        textposition: "none",
                        hoverinfo: "text",
                    });
                }

                const layout = build_over_time_layout(global_bins);
                if (!USE_LINE_PLOT) layout.barmode = "stack";
                layout.legend = { title: { text: "Dandiset" } };

                Plotly.newPlot(plot_element_id, plot_info, layout, PLOTLY_CONFIG);

                // Render archive table view even in grouped mode
                const per_bin_titles = {
                    daily: "Usage per day", weekly: "Usage per week",
                    monthly: "Usage per month", yearly: "Usage per year",
                };
                const date_col_labels = {
                    daily: "Date", weekly: "Week of", monthly: "Month", yearly: "Year",
                };
                if (archive_data) {
                    const agg = aggregate_by_timebin(archive_data.dates, archive_data.bytes, TIME_AGGREGATION);
                    const combined_days = agg.dates.map((date, i) => ({ date, bytes: agg.bytes_sent[i] }));
                    render_sortable_table("over_time_table", per_bin_titles[TIME_AGGREGATION], [
                        { label: date_col_labels[TIME_AGGREGATION], key: "date",  numeric: false },
                        { label: "Usage", key: "bytes", numeric: true },
                    ], combined_days, archive_tsv_url);
                }

                apply_view_mode(plot_element_id, "over_time_table", USE_OVER_TIME_TABLE);
            })
            .catch((error) => {
                console.error("Error in grouped over-time plot:", error);
                const plot_element = document.getElementById(plot_element_id);
                if (plot_element) {
                    plot_element.innerText = "Failed to load data for grouped per day plot.";
                }
            });
    }

    // ── Default single-series mode ────────────────────────────────────────────
    let by_day_summary_tsv_url = `${BASE_TSV_URL}/${dandiset_id}/by_day.tsv`;

    return fetch(by_day_summary_tsv_url)
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Failed to fetch TSV file: ${response.statusText}`);
            }
            return response.text();
        })
        .then((text) => {
            const rows = text.split("\n").filter((row) => row.trim() !== "");
            if (rows.length < 2) {
                throw new Error("TSV file does not contain enough data.");
            }

            const raw_data = rows.slice(1).map((row) => row.split("\t"));

            const raw_dates = raw_data.map((row) => row[0]);
            const raw_bytes = raw_data.map((row) => parseInt(row[1], 10));

            // Aggregate raw daily data into the selected time bin
            const aggregated = aggregate_by_timebin(raw_dates, raw_bytes, TIME_AGGREGATION);
            const dates = aggregated.dates;
            const bytes_sent = aggregated.bytes_sent;

            // Convert to cumulative if the checkbox is checked
            let plot_data = bytes_sent;
            if (USE_CUMULATIVE) {
                plot_data = make_cumulative(bytes_sent);
            }

            const human_readable_bytes_sent = plot_data.map((bytes) => format_bytes(bytes));

            // Build hover label prefix based on the selected aggregation
            const bin_label_prefix = {
                daily: "",
                weekly: "Week of ",
                monthly: "Month: ",
                yearly: "Year: ",
            }[TIME_AGGREGATION];

            const plot_info = [
                {
                    ...(USE_LINE_PLOT
                        ? { type: "scatter", mode: "lines", line: { color: getTheme().accent }, fill: "tozeroy", fillcolor: color_with_alpha(getTheme().accent, 0.2) }
                        : { type: "bar", marker: { color: getTheme().accent } }),
                    x: dates,
                    y: plot_data,
                    text: dates.map((date, index) => `${bin_label_prefix}${date}<br>${human_readable_bytes_sent[index]}`),
                    textposition: "none",
                    hoverinfo: "text",
                }
            ];

            const per_bin_titles = {
                daily:   "Usage per day",
                weekly:  "Usage per week",
                monthly: "Usage per month",
                yearly:  "Usage per year",
            };

            const layout = build_over_time_layout(dates);

            Plotly.newPlot(plot_element_id, plot_info, layout, PLOTLY_CONFIG);

            // Render table view (sortable by column header click; default: bytes descending)
            const date_col_labels = {
                daily:   "Date",
                weekly:  "Week of",
                monthly: "Month",
                yearly:  "Year",
            };
            const combined_days = dates.map((date, i) => ({ date, bytes: bytes_sent[i] }));
            render_sortable_table("over_time_table", per_bin_titles[TIME_AGGREGATION], [
                { label: date_col_labels[TIME_AGGREGATION], key: "date",  numeric: false },
                { label: "Usage", key: "bytes", numeric: true  },
            ], combined_days, by_day_summary_tsv_url);

            apply_view_mode(plot_element_id, "over_time_table", USE_OVER_TIME_TABLE);
        })
        .catch((error) => {
            console.error("Error:", error);
            const plot_element = document.getElementById(plot_element_id);
            if (plot_element) {
                plot_element.innerText = "Failed to load data for per day plot.";
            }
        });
}

// Function to fetch and render histogram over asset or Dandiset IDs
function load_histogram(dandiset_id) {
    let by_asset_summary_tsv_url;
    const controls_el = document.getElementById("histogram");
    const plot_element = document.getElementById("histogram_plot");
    const section_el = plot_element && plot_element.closest('.view-section');

    // Suppress entire histogram section if 'undetermined' or 'unassociated' is selected (nonsensical there)
    if (dandiset_id === "undetermined" || dandiset_id === "unassociated") {
        if (plot_element) {
            plot_element.innerText = "";
        }
        if (controls_el) controls_el.style.display = "none";
        if (section_el) {
            section_el.style.minHeight = "";
            section_el.style.display = "none";
        }
        return "";
    }

    if (plot_element) plot_element.style.display = "";
    if (controls_el) controls_el.style.display = "";
    if (section_el) {
        section_el.style.display = "";
        // Clear any locked height from the previous dandiset so the section
        // doesn't retain a stale tall gap when a new (shorter) dataset loads.
        section_el.style.minHeight = "";
    }

    if (dandiset_id === "archive") {
        return load_dandiset_histogram();
    } else {
        by_asset_summary_tsv_url = `${BASE_TSV_URL}/${dandiset_id}/by_asset.tsv`;
        return load_per_asset_histogram(by_asset_summary_tsv_url);
    }
}

function load_dandiset_histogram() {
    const plot_element_id = "histogram_plot";

    return fetch(ALL_DANDISET_TOTALS_URL)
    .then((response) => {
        if (!response.ok) {
            throw new Error(`Failed to fetch JSON file: ${response.statusText}`);
        }
        return response.json();
    })
    .then((data) => {
        // Exclude 'archive' and cast IDs to strings; sort by bytes descending
        const combined = Object.keys(data)
            .map(dandiset_id => ({
                raw_id: String(dandiset_id),
                dandiset_id: "Dandiset ID " + String(dandiset_id),
                bytes: data[dandiset_id].total_bytes_sent
            }))
            .sort((a, b) => b.bytes - a.bytes);

        const sorted_dandiset_ids = combined.map(item => item.dandiset_id);
        const sorted_bytes_sent = combined.map(item => item.bytes);
        const human_readable_bytes_sent = sorted_bytes_sent.map(bytes => format_bytes(bytes));

        const plot_data = [
            {
                ...(USE_LINE_PLOT
                    ? { type: "scatter", mode: "lines", line: { color: getTheme().accent }, fill: "tozeroy", fillcolor: color_with_alpha(getTheme().accent, 0.2) }
                    : { type: "bar", marker: { color: getTheme().accent } }),
                x: sorted_dandiset_ids,
                y: sorted_bytes_sent,
                text: sorted_dandiset_ids.map((dandiset_id, index) => `${dandiset_id}<br>${human_readable_bytes_sent[index]}`),
                textposition: "none",
                hoverinfo: "text",
            }
        ];

        const layout = applyTheme({
            bargap: 0,
            title: {
                text: `Usage per Dandiset`,
                font: { size: 24 }
            },
            xaxis: {
                title: {
                    text: "(hover over a bar to see the Dandiset)",
                    font: { size: 12 }
                },
                showticklabels: false,
            },
            yaxis: {
                type: USE_LOG_SCALE ? "log" : "linear",
                tickformat: USE_LOG_SCALE ? "" : "~s",
                ticksuffix: USE_LOG_SCALE ? "" : "B",
                tickvals: USE_LOG_SCALE ? [1000, 1000000, 1000000000, 1000000000000, 1000000000000000, 1000000000000000000] : null,
                ticktext: USE_LOG_SCALE ? ["KB", "MB", "GB", "TB"] : null
            },
        });

        Plotly.newPlot(plot_element_id, plot_data, layout, PLOTLY_CONFIG);

        // Render table view (sortable by column header click; default: bytes descending)
        render_sortable_table("histogram_table", "", [
            { label: "Dandiset ID", key: "raw_id", numeric: false },
            { label: "Usage", key: "bytes",   numeric: true  },
        ], combined, ALL_DANDISET_TOTALS_URL);

        apply_view_mode(plot_element_id, "histogram_table", USE_HISTOGRAM_TABLE);
    })
    .catch((error) => {
        console.error("Error:", error);
        const plot_element = document.getElementById(plot_element_id);
        if (plot_element) {
            while (plot_element.firstChild) {
                plot_element.removeChild(plot_element.firstChild);
            }
        }
    });
}

function load_per_asset_histogram(by_asset_summary_tsv_url) {
    const plot_element_id = "histogram_plot";

    return fetch(by_asset_summary_tsv_url)
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Failed to fetch TSV file: ${response.statusText}`);
            }
            return response.text();
        })
        .then((text) => {
            const rows = text.split("\n").filter((row) => row.trim() !== "");
            if (rows.length < 2) {
                throw new Error("TSV file does not contain enough data.");
            }

            const data = rows.slice(1).map((row) => row.split("\t"));

            const asset_names = data.map((row) => {
                let suffix, filename;
                suffix = row[0].split(".").at(-1);
                filename = suffix === "nwb" ? row[0].split("/").at(-1) : row[0];

                return filename;
            });
            const bytes_sent = data.map((row) => parseInt(row[1], 10));

            // Sort asset_names and bytes_sent in descending order by bytes_sent
            const combined = asset_names.map((name, idx) => ({ name, bytes: bytes_sent[idx] }));
            combined.sort((a, b) => b.bytes - a.bytes);

            const sorted_asset_names = combined.map(item => item.name);
            const sorted_bytes_sent = combined.map(item => item.bytes);
            const human_readable_bytes_sent = sorted_bytes_sent.map((bytes) => format_bytes(bytes));

            // Use sorted arrays in the plot
            const plot_data = [
                {
                    ...(USE_LINE_PLOT
                        ? { type: "scatter", mode: "lines", line: { color: getTheme().accent }, fill: "tozeroy", fillcolor: color_with_alpha(getTheme().accent, 0.2) }
                        : { type: "bar", marker: { color: getTheme().accent } }),
                    x: sorted_asset_names,
                    y: sorted_bytes_sent,
                    text: sorted_asset_names.map((name, index) => `${name}<br>${human_readable_bytes_sent[index]}`),
                    textposition: "none",
                    hoverinfo: "text",
                }
            ];

            const layout = applyTheme({
                bargap: 0,
                title: {
                    text: `Usage per asset`,
                    font: { size: 24 }
                },
                xaxis: {
                    showticklabels: false,
                },
                yaxis: {
                    type: USE_LOG_SCALE ? "log" : "linear",
                    tickformat: USE_LOG_SCALE ? "" : "~s",
                    ticksuffix: USE_LOG_SCALE ? "" : "B",
                    tickvals: USE_LOG_SCALE ? [1000, 1000000, 1000000000, 1000000000000, 1000000000000000, 1000000000000000000] : null,
                    ticktext: USE_LOG_SCALE ? ["KB", "MB", "GB", "TB"] : null
                },
            });

            Plotly.newPlot(plot_element_id, plot_data, layout, PLOTLY_CONFIG);

            // Render table view (sortable by column header click; default: bytes descending)
            render_sortable_table("histogram_table", "Usage per asset", [
                { label: "Asset",      key: "name",  numeric: false },
                { label: "Usage", key: "bytes", numeric: true  },
            ], combined, by_asset_summary_tsv_url);

            apply_view_mode(plot_element_id, "histogram_table", USE_HISTOGRAM_TABLE);
        })
        .catch((error) => {
            console.error("Error:", error);
            const plot_element = document.getElementById(plot_element_id);
            if (plot_element) {
                while (plot_element.firstChild) {
                    plot_element.removeChild(plot_element.firstChild);
                }
            }
        });
}

// Function to fetch and render AWS regions as a table
function load_aws_histogram(dandiset_id) {
    const element = document.getElementById("aws_histogram");
    if (!element) return Promise.resolve();

    let by_region_summary_tsv_url = `${BASE_TSV_URL}/${dandiset_id}/by_region.tsv`;

    return fetch(by_region_summary_tsv_url)
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Failed to fetch TSV file: ${response.statusText}`);
            }
            return response.text();
        })
        .then((text) => {
            const rows = text.split("\n").filter((row) => row.trim() !== "");
            if (rows.length < 2) {
                element.innerHTML = "";
                return;
            }

            const data = rows.slice(1).map((row) => row.split("\t"));
            const subregion_data = [];

            data.forEach((row) => {
                const region = row[0];
                if (!region.startsWith("AWS/")) return;
                const region_clipped = region.replace("AWS/", "");
                const bytes = parseInt(row[1], 10);
                subregion_data.push({ name: region_clipped, bytes: bytes });
            });

            subregion_data.sort((a, b) => b.bytes - a.bytes);

            if (subregion_data.length === 0) {
                element.innerHTML = "";
                return;
            }

            const total_bytes = subregion_data.reduce((acc, item) => acc + item.bytes, 0);

            render_sortable_table("aws_histogram", `${format_bytes(total_bytes)} sent to AWS data centers`, [
                { label: "AWS Region", key: "name",  numeric: false },
                { label: "Usage", key: "bytes", numeric: true  },
            ], subregion_data, by_region_summary_tsv_url);
        })
        .catch((error) => {
            console.error("Error:", error);
            if (element) element.innerHTML = "";
        });
}

// Normalize a subdivision name for matching against GeoJSON features
function normalize_region_name(name) {
    if (!name) return "";
    name = name.toLowerCase();
    const prefixes = ["state of ", "province of ", "region of ", "republic of ",
                      "city state ", "county of "];
    for (const prefix of prefixes) {
        if (name.startsWith(prefix)) {
            name = name.slice(prefix.length);
        }
    }
    const suffixes = [" county", " province", " region", " parish",
                      " prefecture", " department", " district",
                      " governorate", " municipality"];
    for (const suffix of suffixes) {
        if (name.endsWith(suffix)) {
            name = name.slice(0, -suffix.length);
        }
    }
    const replacements = {
        'á':'a','à':'a','â':'a','ä':'a','ã':'a','ą':'a','ă':'a','ā':'a',
        'é':'e','è':'e','ê':'e','ë':'e','ę':'e','ě':'e','ė':'e','ǝ':'e',
        'í':'i','ì':'i','î':'i','ï':'i','ı':'i','ī':'i',
        'ó':'o','ò':'o','ô':'o','ö':'o','õ':'o','ő':'o','ō':'o',
        'ú':'u','ù':'u','û':'u','ü':'u','ű':'u','ū':'u',
        'ñ':'n','ń':'n','ň':'n',
        'ç':'c','ć':'c','č':'c','ċ':'c',
        'ß':'ss','ş':'s','ș':'s','š':'s','ś':'s',
        'ø':'o','å':'a','æ':'ae',
        'ł':'l','ľ':'l',
        'ý':'y','ÿ':'y',
        'ž':'z','ź':'z','ż':'z',
        'ř':'r','ŕ':'r',
        'ţ':'t','ț':'t','ť':'t',
        'đ':'d','ď':'d',
        'ğ':'g','ħ':'h','ḥ':'h',
        '-':' ','_':' ',"'":"",'\u2019':'','\u2018':'','\u02bc':'',
    };
    for (const [old, repl] of Object.entries(replacements)) {
        name = name.split(old).join(repl);
    }
    return name.trim();
}

// Load TopoJSON and name aliases (cached after first load)
function load_choropleth_data() {
    const promises = [];
    if (!GEOJSON_DATA) {
        promises.push(
            fetch("gadm_admin1_simplified.topojson")
                .then(r => { if (!r.ok) throw new Error("Failed to fetch TopoJSON"); return r.json(); })
                .then(topoData => {
                    const objectName = Object.keys(topoData.objects)[0];
                    GEOJSON_DATA = topojsonFeature(topoData, topoData.objects[objectName]);
                })
        );
    }
    if (!NAME_ALIASES) {
        promises.push(
            fetch("name_aliases.json")
                .then(r => { if (!r.ok) throw new Error("Failed to fetch name aliases"); return r.json(); })
                .then(data => { NAME_ALIASES = data; })
        );
    }
    return Promise.all(promises);
}

// Build lookups from "iso2/name_norm" to feature index for fast matching
function build_geojson_lookup() {
    const lookup = {};
    const country_lookup = {};
    GEOJSON_DATA.features.forEach((feature, idx) => {
        const iso2 = feature.properties.iso2;
        const name_norm = feature.properties.name_norm;
        if (iso2 && name_norm && name_norm.length > 1) {
            const key = `${iso2}/${name_norm}`;
            lookup[key] = idx;
            if (!country_lookup[iso2]) country_lookup[iso2] = [];
            country_lookup[iso2].push([name_norm, idx]);
        }
    });
    return { lookup, country_lookup };
}

// Country remapping for special cases (e.g., HK → CN/Hong Kong)
const COUNTRY_REMAPPING = {
    'HK': ['CN', 'Hong Kong'],
    'MO': ['CN', 'Macau'],
    'SG': ['SG', null],
    'MK': ['MK', null],
    'XK': ['XK', null],
    'NU': ['NU', null],
    'MQ': ['MQ', null],
    'CW': ['CW', null],
    'MV': ['MV', null],
};

// Match a TSV region key to a GeoJSON feature index
function match_region_to_feature(region, lookup, country_lookup) {
    const parts = region.split("/");
    if (parts.length < 2) return -1;
    let country_code = parts[0];
    if (country_code === "AWS" || country_code === "GCP") return -1;
    let subdivision_name = parts[1];

    // Apply country remapping
    if (country_code in COUNTRY_REMAPPING) {
        const [new_cc, fixed_region] = COUNTRY_REMAPPING[country_code];
        if (fixed_region) {
            country_code = new_cc;
            subdivision_name = fixed_region;
        } else {
            return -1; // Aggregate to country level, skip
        }
    }

    const norm_name = normalize_region_name(subdivision_name);

    // Try direct normalized match
    const direct_key = `${country_code}/${norm_name}`;
    if (direct_key in lookup) return lookup[direct_key];

    // Try alias match
    if (NAME_ALIASES && NAME_ALIASES[country_code]) {
        const aliased = NAME_ALIASES[country_code][norm_name];
        if (aliased) {
            const alias_key = `${country_code}/${aliased}`;
            if (alias_key in lookup) return lookup[alias_key];
        }
    }

    // Try partial/substring match as last resort
    if (country_lookup && country_lookup[country_code]) {
        for (const [feat_norm, feat_idx] of country_lookup[country_code]) {
            if (norm_name.length > 3 && (feat_norm.includes(norm_name) || norm_name.includes(feat_norm))) {
                return feat_idx;
            }
        }
    }

    return -1;
}

// Function to populate top regions table from TSV data
function load_top_regions_table(by_region_summary_tsv_url) {
    return fetch(by_region_summary_tsv_url)
        .then((response) => {
            if (!response.ok) throw new Error("Failed to fetch TSV");
            return response.text();
        })
        .then((text) => {
            const rows = text.split("\n").filter((row) => row.trim() !== "");
            if (rows.length < 2) {
                const el = document.getElementById("top_regions_table");
                if (el) el.innerHTML = "";
                return;
            }

            const data = rows.slice(1).map((row) => row.split("\t"));

            // Filter out cloud regions, sort by bytes descending
            const regions = data
                .filter((row) => {
                    const cc = row[0].split("/")[0];
                    return cc !== "AWS" && cc !== "GCP";
                })
                .map((row) => ({ region: row[0], bytes: parseInt(row[1], 10) }));

            if (regions.length === 0) {
                const el = document.getElementById("top_regions_table");
                if (el) el.innerHTML = "";
                return;
            }

            render_sortable_table("top_regions_table", "Usage per region", [
                { label: "Region", key: "region", numeric: false },
                { label: "Usage", key: "bytes", numeric: true },
            ], regions, by_region_summary_tsv_url);
        })
        .catch(() => {
            const el = document.getElementById("top_regions_table");
            if (el) el.innerHTML = "";
        });
}

// Function to fetch and render heatmap over geography
function load_geographic_heatmap(dandiset_id) {
    const plot_element_id = "geography_heatmap";
    let by_region_summary_tsv_url = `${BASE_TSV_URL}/${dandiset_id}/by_region.tsv`;

    // Clear any locked height from the previous dandiset before reapplying view mode
    const mapEl = document.getElementById(plot_element_id);
    const section_el = mapEl && mapEl.closest('.view-section');
    if (section_el) section_el.style.minHeight = "";

    const topRegionsPromise = load_top_regions_table(by_region_summary_tsv_url);

    // Apply the current view mode each time geo data reloads
    apply_geo_view_mode(GEO_VIEW);

    if (GEO_VIEW === "regions") {
        return Promise.all([
            topRegionsPromise,
            load_geographic_choropleth(dandiset_id, plot_element_id, by_region_summary_tsv_url),
        ]);
    }

    // Table / AWS view: tables already populated above, nothing more to render
    if (GEO_VIEW !== "points") return topRegionsPromise;

    if (!REGION_CODES_TO_LATITUDE_LONGITUDE) {
        console.error("Region coordinates not loaded");
        const plot_element = document.getElementById(plot_element_id);
        if (plot_element) {
            plot_element.innerText = "Failed to load data for geographic heatmap.";
        }
        return topRegionsPromise;
    }

    const pointsPromise = fetch(by_region_summary_tsv_url)
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Failed to fetch TSV file: ${response.statusText}`);
            }
            return response.text();
        })
        .then((text) => {
            const rows = text.split("\n").filter((row) => row.trim() !== "");
            if (rows.length < 2) {
                throw new Error("TSV file does not contain enough data.");
            }

            const data = rows
                .slice(1)
                .map((row) => row.split("\t"))
                .sort((a, b) => parseInt(a[1], 10) - parseInt(b[1], 10));

            const latitudes = [];
            const longitudes = [];
            const bytes_sent = [];
            const hover_texts = [];

            data.forEach((row) => {
                const region = row[0];
                const bytes = parseInt(row[1], 10);
                const coordinates = REGION_CODES_TO_LATITUDE_LONGITUDE[region];
                const human_readable_bytes_sent = format_bytes(bytes);

                if (coordinates) {
                    latitudes.push(coordinates.latitude);
                    longitudes.push(coordinates.longitude);
                    bytes_sent.push(bytes);
                    hover_texts.push(`${region}<br>${human_readable_bytes_sent}`);
                }
            });

            const plot_info = [
                {
                    type: "scattergeo",
                    mode: "markers",
                    lat: latitudes,
                    lon: longitudes,
                    marker: {
                        symbol: "circle",
                        size: bytes_sent.map((bytes) => Math.log(bytes) * 0.5),
                        color: bytes_sent.map(bytes => Math.log10(Math.max(1, bytes))),
                        colorscale: "Viridis",
                        colorbar: {
                            title: "Bytes (log scale)",
                            tickvals: [3, 6, 9, 12],
                            ticktext: ["KB", "MB", "GB", "TB"]
                        },
                        opacity: 0.9,
                    },
                    text: hover_texts,
                    textposition: "none",
                    hoverinfo: "text",
                },
            ];

            const layout = applyTheme({
                title: {
                    text: "Usage by region",
                    font: { size: 24 },
                },
                geo: {
                    projection: { type: "equirectangular" },
                    bgcolor: getTheme().surface,
                    lakecolor: getTheme().bg,
                    landcolor: getTheme().border,
                    showocean: true,
                    oceancolor: getTheme().bg,
                    showlakes: true,
                    showland: true,
                    countrycolor: getTheme().border,
                },
            });

            Plotly.newPlot(plot_element_id, plot_info, layout, PLOTLY_CONFIG);
        })
        .catch((error) => {
            console.error("Error:", error);
            const plot_element = document.getElementById(plot_element_id);
            if (plot_element) {
                plot_element.innerText = "Failed to load data for geographic heatmap.";
            }
        });

    return Promise.all([topRegionsPromise, pointsPromise]);
}

// Function to fetch and render choropleth over geography
function load_geographic_choropleth(dandiset_id, plot_element_id, by_region_summary_tsv_url) {
    return Promise.all([
        load_choropleth_data(),
        fetch(by_region_summary_tsv_url).then(r => {
            if (!r.ok) throw new Error(`Failed to fetch TSV file: ${r.statusText}`);
            return r.text();
        })
    ])
    .then(([_, text]) => {
        const rows = text.split("\n").filter((row) => row.trim() !== "");
        if (rows.length < 2) {
            throw new Error("TSV file does not contain enough data.");
        }

        const data = rows.slice(1).map((row) => row.split("\t"));
        const { lookup, country_lookup } = build_geojson_lookup();

        // Accumulate bytes per feature
        const feature_bytes = new Array(GEOJSON_DATA.features.length).fill(0);
        data.forEach((row) => {
            const region = row[0];
            const bytes = parseInt(row[1], 10);
            const idx = match_region_to_feature(region, lookup, country_lookup);
            if (idx >= 0) {
                feature_bytes[idx] += bytes;
            }
        });

        // Build a filtered GeoJSON with only features that have data
        // Skip features that cross the dateline (lon span > 300°) as they
        // cause Plotly to fill the entire map width
        const filtered_features = [];
        const z_values = [];
        const hover_texts = [];

        // Skip features that cross the antimeridian (have both very
        // negative and very positive longitudes) as they render incorrectly
        function hasWideLonSpan(feature) {
            let minLon = Infinity, maxLon = -Infinity;
            function scanCoords(coords) {
                if (typeof coords[0] === "number") {
                    if (coords[0] < minLon) minLon = coords[0];
                    if (coords[0] > maxLon) maxLon = coords[0];
                } else {
                    for (const c of coords) scanCoords(c);
                }
            }
            scanCoords(feature.geometry.coordinates);
            return (maxLon - minLon) > 180;
        }

        feature_bytes.forEach((bytes, idx) => {
            if (bytes > 0) {
                const feature = GEOJSON_DATA.features[idx];
                if (hasWideLonSpan(feature)) return;
                const name = feature.properties.name;
                const iso2 = feature.properties.iso2;
                filtered_features.push(feature);
                z_values.push(Math.log10(bytes));
                hover_texts.push(`${iso2}/${name}<br>${format_bytes(bytes)}`);
            }
        });

        const filtered_geojson = {
            type: "FeatureCollection",
            features: filtered_features,
        };

        const locations = filtered_features.map(f => f.properties.id);

        // Compute colorbar ticks based on data range
        const colorbar_config = (function() {
            const allTicks = [3, 6, 9, 12, 15];
            const allLabels = ["KB", "MB", "GB", "TB", "PB"];
            if (z_values.length === 0) return { title: "Bytes (log scale)" };
            const zMin = Math.min(...z_values);
            const zMax = Math.max(...z_values);
            let vals = allTicks.filter(v => v >= zMin - 1 && v <= zMax + 1);
            let texts = vals.map(v => allLabels[allTicks.indexOf(v)]);
            if (vals.length < 2) {
                const lo = Math.floor(zMin);
                const hi = Math.ceil(zMax);
                vals = lo === hi ? [lo, lo + 1] : [lo, hi];
                texts = vals.map(v => {
                    const idx = allTicks.indexOf(v);
                    return idx >= 0 ? allLabels[idx] : "10^" + v;
                });
            }
            return { title: "Bytes (log scale)", tickvals: vals, ticktext: texts };
        })();

        const plot_info = [
                {
                    type: "choroplethmap",
                    geojson: filtered_geojson,
                    featureidkey: "properties.id",
                    locations: locations,
                    z: z_values,
                    text: hover_texts,
                    hoverinfo: "text",
                    colorscale: "YlOrRd",
                    reversescale: true,
                    colorbar: colorbar_config,
                    marker: {
                        line: {
                            color: "white",
                            width: 0.5,
                        },
                        opacity: 0.8,
                    },
                },
            ];

            const mapEl = document.getElementById(plot_element_id);
            const mapWidth = mapEl ? mapEl.offsetWidth : 800;
            const defaultZoom = Math.max(1, Math.log2(mapWidth / 512));
            // Min zoom allows seeing the full earth: at 256px per tile at zoom 0,
            // we need zoom = log2(width / 256) to fill the container once
            const minZoom = defaultZoom - 0.15;

        const layout = applyTheme({
            title: {
                text: "Usage by region",
                font: { size: 24 },
            },
            map: {
                style: getTheme().mapStyle,
                center: { lat: 40, lon: 0 },
                zoom: defaultZoom,
                minzoom: minZoom,
            },
            annotations: [
                {
                    text: 'Geographic boundaries are defined by <a href="https://gadm.org/" target="_blank">GADM v4.1</a> | '
                        + '<a href="https://carto.com/attributions" target="_blank">© CARTO</a> | '
                        + '<a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a>',
                    showarrow: false,
                    xref: "paper",
                    yref: "paper",
                    x: 0.01,
                    y: 0.01,
                    xanchor: "left",
                    yanchor: "bottom",
                    font: {
                        size: 10,
                        color: getTheme().textSecondary,
                    },
                    bgcolor: getTheme().annotationBg,
                    borderpad: 3,
                },
            ],
        });

        Plotly.newPlot(plot_element_id, plot_info, layout, PLOTLY_CONFIG).then(() => {
            const el = document.getElementById(plot_element_id);
            if (el && el._fullLayout && el._fullLayout.map && el._fullLayout.map._subplot) {
                const map = el._fullLayout.map._subplot.map;
                if (map) {
                    if (map.setMinZoom) map.setMinZoom(minZoom);
                }
            }
        });
    })
    .catch((error) => {
        console.error("Error:", error);
        const plot_element = document.getElementById(plot_element_id);
        if (plot_element) {
            plot_element.innerText = "Failed to load data for geographic choropleth.";
        }
    });
}

// format_bytes delegates to the pure utility, passing the current binary/decimal setting.
function format_bytes(bytes, decimals = 2) {
    return format_bytes_pure(bytes, decimals, USE_BINARY);
}
