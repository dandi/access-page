// TODO: if using a proper framework/package structure, import the error helper
// (working for the moment due to global import in the index.html file)

// ── Dark-theme helpers (mirrors :root CSS variables in index.html) ──────────
const DARK_THEME = {
    bg:            '#1a1a2e',
    surface:       '#16213e',
    border:        '#2a2a4a',
    text:          '#e0e0e0',
    textSecondary: '#a0a0b0',
    accent:        '#53a8b6',
};

/**
 * Mutates `layout` in-place to apply the dark-theme colours and returns it.
 * Axis overrides are merged so callers can still add axis-specific options.
 */
function applyDarkTheme(layout) {
    layout.paper_bgcolor = DARK_THEME.surface;
    layout.plot_bgcolor  = DARK_THEME.surface;
    layout.font = Object.assign({ color: DARK_THEME.text }, layout.font || {});

    const axisDefaults = {
        gridcolor:     DARK_THEME.border,
        linecolor:     DARK_THEME.border,
        zerolinecolor: DARK_THEME.border,
        tickfont:      { color: DARK_THEME.textSecondary },
        titlefont:     { color: DARK_THEME.textSecondary },
    };
    if (layout.xaxis) Object.assign(layout.xaxis, { ...axisDefaults, ...layout.xaxis });
    if (layout.yaxis) Object.assign(layout.yaxis, { ...axisDefaults, ...layout.yaxis });
    return layout;
}
// ────────────────────────────────────────────────────────────────────────────

/**
 * Rebuilds the consolidated "Data sources" section at the bottom of the page
 * for the given dandiset ID.
 *
 * @param {string} dandiset_id - The currently selected dandiset (or "archive"/"undetermined").
 */
function update_data_sources(dandiset_id) {
    const container = document.getElementById("data_sources_links");
    if (!container) return;

    const entries = [];

    entries.push({
        label: "Bytes per day",
        url: `${BASE_TSV_URL}/${dandiset_id}/by_day.tsv`,
    });

    if (dandiset_id === "archive") {
        entries.push({ label: "Bytes per dandiset", url: ALL_DANDISET_TOTALS_URL });
    } else if (dandiset_id !== "undetermined") {
        entries.push({
            label: "Bytes per asset",
            url: `${BASE_TSV_URL}/${dandiset_id}/by_asset.tsv`,
        });
    }

    entries.push({
        label: "Bytes by region",
        url: `${BASE_TSV_URL}/${dandiset_id}/by_region.tsv`,
    });

    container.innerHTML = "";
    entries.forEach((entry, index) => {
        if (index > 0) {
            const sep = document.createElement("span");
            sep.className = "data-sources-sep";
            sep.setAttribute("aria-hidden", "true");
            sep.textContent = "·";
            container.appendChild(sep);
        }
        const a = document.createElement("a");
        a.href = entry.url;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = entry.label;
        container.appendChild(a);
    });
}

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
const BASE_URL = "https://raw.githubusercontent.com/dandi/access-summaries/main";
const BASE_TSV_URL = `${BASE_URL}/content/summaries`;

const ARCHIVE_TOTALS_URL = `${BASE_URL}/content/archive_totals.json`;
const ALL_DANDISET_TOTALS_URL = `${BASE_URL}/content/totals.json`;
const REGION_CODES_TO_LATITUDE_LONGITUDE_URL = `${BASE_URL}/content/region_codes_to_coordinates.yaml`;

let REGION_CODES_TO_LATITUDE_LONGITUDE = {};
let ALL_DANDISET_TOTALS = {};
let USE_LOG_SCALE = false;
let USE_CUMULATIVE = false;
let USE_BINARY = false;
let USE_CHOROPLETH = true;
let GEOJSON_DATA = null;
let NAME_ALIASES = null;



// Check if Plotly is loaded after the window loads
window.addEventListener("load", () => {
    if (typeof Plotly === "undefined") {
        handlePlotlyError();
    }

    // Settings panel (gear wheel) open/close
    const settingsBtn = document.getElementById("settings_btn");
    const settingsPanel = document.getElementById("settings_panel");
    if (settingsBtn && settingsPanel) {
        settingsBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            const isOpen = settingsPanel.classList.toggle("open");
            settingsBtn.setAttribute("aria-expanded", String(isOpen));
            settingsPanel.setAttribute("aria-hidden", String(!isOpen));
        });
        document.addEventListener("click", function (e) {
            if (!settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
                settingsPanel.classList.remove("open");
                settingsBtn.setAttribute("aria-expanded", "false");
                settingsPanel.setAttribute("aria-hidden", "true");
            }
        });
        // Close on Escape key
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") {
                settingsPanel.classList.remove("open");
                settingsBtn.setAttribute("aria-expanded", "false");
                settingsPanel.setAttribute("aria-hidden", "true");
            }
        });
    }

    // Add event listener for log scale checkbox
    const logScaleCheckbox = document.getElementById("log_scale");
    if (logScaleCheckbox) {
        logScaleCheckbox.addEventListener("change", function() {
            USE_LOG_SCALE = this.checked;

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
        // Initialize from URL
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get("cumulative") === "true") {
            cumulativeCheckbox.checked = true;
            USE_CUMULATIVE = true;
        }

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

    // Add event listener for binary/decimal toggle
    const prefix_selector = document.getElementById("prefix");
    if (prefix_selector) {
        prefix_selector.addEventListener("change", function () {
            USE_BINARY = this.value === "binary";

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

    // Add event listener for map style radio toggle
    const mapStyleRadios = document.querySelectorAll('input[name="map_style"]');
    // Initialize from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const urlMap = urlParams.get("map");
    if (urlMap === "dots") {
        USE_CHOROPLETH = false;
        const dotsRadio = document.querySelector('input[name="map_style"][value="dots"]');
        if (dotsRadio) dotsRadio.checked = true;
    }

    mapStyleRadios.forEach((radio) => {
        radio.addEventListener("change", function() {
            USE_CHOROPLETH = this.value === "region";

            const params = new URLSearchParams(window.location.search);
            if (!USE_CHOROPLETH) {
                params.set("map", "dots");
            } else {
                params.delete("map");
            }
            const query = params.toString();
            const newUrl = window.location.pathname + (query ? "?" + query : "");
            window.history.pushState({}, "", newUrl);

            const selected_dandiset = document.getElementById("dandiset_selector").value;
            load_geographic_heatmap(selected_dandiset);
        });
    });
});

// Add an event listener for window resize
window.addEventListener("resize", resizePlots);

function resizePlots() {
    const plotIds = ["over_time_plot", "histogram", "aws_histogram", "geography_heatmap"];
    plotIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el && el.data) {
            Plotly.Plots.resize(el);
        }
    });

    // Update min zoom for the choroplethmap based on new width
    const mapEl = document.getElementById("geography_heatmap");
    if (mapEl && USE_CHOROPLETH && mapEl._fullLayout && mapEl._fullLayout.map && mapEl._fullLayout.map._subplot) {
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
        REGION_CODES_TO_LATITUDE_LONGITUDE = jsyaml.load(data);
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
            update_totals(id);
            update_data_sources(id);
            load_over_time_plot(id);
            load_histogram(id);
            load_aws_histogram(id);
            load_geographic_heatmap(id);
        };

        // Check URL for a dandiset parameter and load initial plots
        const urlParams = new URLSearchParams(window.location.search);
        setSelectedDandiset(urlParams.get("dandiset"));

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
        //totals_element.innerText = `Totals: ${human_readable_bytes_sent} sent to ?(WIP)? unique requesters from
        // ${totals.number_of_unique_regions} regions of ${totals.number_of_unique_countries} countries.`;
        header = `A total of ${human_readable_bytes_sent} was sent to ${totals.number_of_unique_regions} regions across ${totals.number_of_unique_countries} countries. <sup>*</sup>`
        totals_element.innerHTML = dandiset_id != "undetermined" ? header : header + `<br>However, the activity could not be uniquely associated with a particular Dandiset.<br>This can occur if the same file exists within more than one Dandiset at a time.`

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

// Function to fetch and render the over time for a given Dandiset ID
function load_over_time_plot(dandiset_id) {
    const plot_element_id = "over_time_plot";
    let by_day_summary_tsv_url = `${BASE_TSV_URL}/${dandiset_id}/by_day.tsv`;

    fetch(by_day_summary_tsv_url)
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

            const dates = raw_data.map((row) => row[0]);
            const bytes_sent = raw_data.map((row) => parseInt(row[1], 10));

            // Convert to cumulative if the checkbox is checked
            let plot_data = bytes_sent;
            if (USE_CUMULATIVE) {
                plot_data = bytes_sent.reduce((acc, value, index) => {
                    acc.push((acc[index - 1] || 0) + value);
                    return acc;
                }, []);
            }

            const human_readable_bytes_sent = plot_data.map((bytes) => format_bytes(bytes));
            // TODO: cleanup code

            const plot_info = [
                {
                    type: "bar",
                    x: dates, // Use raw dates for proper alignment
                    y: plot_data,
                    text: dates.map((date, index) => `${date}<br>${human_readable_bytes_sent[index]}`),
                    textposition: "none",
                    hoverinfo: "text",
                    marker: { color: DARK_THEME.accent },
                }
            ];

            const layout = applyDarkTheme({
                bargap: 0,
                title: {
                    text: USE_CUMULATIVE ? `Total bytes sent to date` : `Bytes sent per day` ,
                    font: { size: 24 }
                },
                xaxis: {
                    title: {
                        text: "Date",
                        font: { size: 16 }
                    },
                    tickformat: "%Y-%m-%d",
                },
                yaxis: {
                    title: {
                        text: USE_LOG_SCALE ? "Bytes (log scale)" : "Bytes",
                        font: { size: 16 }
                    },
                    type: USE_LOG_SCALE ? "log" : "linear",
                    tickformat: USE_LOG_SCALE ? "" : "s",
                    ticksuffix: USE_LOG_SCALE ? "" : "B",
                    tickvals: USE_LOG_SCALE ? [1000, 1000000, 1000000000, 1000000000000, 1000000000000000] : null,
                    ticktext: USE_LOG_SCALE ? ["KB", "MB", "GB", "TB"] : null,
                },
            });

            if (USE_CUMULATIVE) {
                const date_set = new Set(dates);
                const min_date = new Date(Math.min(...dates.map(d => new Date(d))));
                const max_date = new Date(Math.max(...dates.map(d => new Date(d))));
                let all_dates = [];
                for (let date = new Date(min_date); date <= max_date; date.setDate(date.getDate() + 1)) {
                    all_dates.push(date.toISOString().slice(0, 10));
                }
                const missing_dates = all_dates.filter(date => !date_set.has(date));

                layout.xaxis.rangebreaks = [
                    {
                        values: missing_dates
                    }
                ];
            }

            Plotly.newPlot(plot_element_id, plot_info, layout);
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
    let by_asset_summary_tsv_url, dandiset_totals_json_url;

    // Suppress div element content if 'archive' is selected
    if (dandiset_id === "undetermined") {
        const plot_element = document.getElementById("histogram");
        if (plot_element) {
            plot_element.innerText = "";
        }
        return "";
    } if (dandiset_id === "archive") {
        load_dandiset_histogram()
    } else {
        by_asset_summary_tsv_url = `${BASE_TSV_URL}/${dandiset_id}/by_asset.tsv`;
        load_per_asset_histogram(by_asset_summary_tsv_url);
    }
}

function load_dandiset_histogram() {
    const plot_element_id = "histogram";

    fetch(ALL_DANDISET_TOTALS_URL)
    .then((response) => {
        if (!response.ok) {
            throw new Error(`Failed to fetch JSON file: ${response.statusText}`);
        }
        return response.json();
    })
    .then((data) => {
        // Exclude 'archive' and cast IDs to strings
        const combined = Object.keys(data)
            .map(dandiset_id => ({
                dandiset_id: "Dandiset ID " + String(dandiset_id),
                bytes: data[dandiset_id].total_bytes_sent
            }))
            .sort((a, b) => b.bytes - a.bytes);

    const sorted_dandiset_ids = combined.map(item => item.dandiset_id);
        const sorted_bytes_sent = combined.map(item => item.bytes);
        const human_readable_bytes_sent = sorted_bytes_sent.map(bytes => format_bytes(bytes));

        const plot_data = [
            {
                type: "bar",
                x: sorted_dandiset_ids,
                y: sorted_bytes_sent,
                text: sorted_dandiset_ids.map((dandiset_id, index) => `${dandiset_id}<br>${human_readable_bytes_sent[index]}`),
                textposition: "none",
                hoverinfo: "text",
                marker: { color: DARK_THEME.accent },
            }
        ];

        const layout = applyDarkTheme({
            bargap: 0,
            title: {
                text: `Bytes sent per Dandiset`,
                font: { size: 24 }
            },
            xaxis: {
                title: {
                    text: "(hover over an entry for Dandiset IDs)",
                    font: { size: 16 }
                },
                showticklabels: false,
            },
            yaxis: {
                title: {
                    text: USE_LOG_SCALE ? "Bytes (log scale)" : "Bytes",
                    font: { size: 16 }
                },
                type: USE_LOG_SCALE ? "log" : "linear",
                tickformat: USE_LOG_SCALE ? "" : "~s",
                ticksuffix: USE_LOG_SCALE ? "" : "B",
                tickvals: USE_LOG_SCALE ? [1000, 1000000, 1000000000, 1000000000000, 1000000000000000, 1000000000000000000] : null,
                ticktext: USE_LOG_SCALE ? ["KB", "MB", "GB", "TB"] : null
            },
        });

        Plotly.newPlot(plot_element_id, plot_data, layout);
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
    const plot_element_id = "histogram";

    fetch(by_asset_summary_tsv_url)
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
                    type: "bar",
                    x: sorted_asset_names,
                    y: sorted_bytes_sent,
                    text: sorted_asset_names.map((name, index) => `${name}<br>${human_readable_bytes_sent[index]}`),
                    textposition: "none",
                    hoverinfo: "text",
                    marker: { color: DARK_THEME.accent },
                }
            ];

            const layout = applyDarkTheme({
                bargap: 0,
                title: {
                    text: `Bytes sent per asset`,
                    font: { size: 24 }
                },
                xaxis: {
                    title: {
                        text: "(hover over an entry for asset names)",
                        font: { size: 16 }
                    },
                    showticklabels: false,
                },
                yaxis: {
                    title: {
                        text: USE_LOG_SCALE ? "Bytes (log scale)" : "Bytes",
                        font: { size: 16 }
                    },
                    type: USE_LOG_SCALE ? "log" : "linear",
                    tickformat: USE_LOG_SCALE ? "" : "~s",
                    ticksuffix: USE_LOG_SCALE ? "" : "B",
                    tickvals: USE_LOG_SCALE ? [1000, 1000000, 1000000000, 1000000000000, 1000000000000000, 1000000000000000000] : null,
                    ticktext: USE_LOG_SCALE ? ["KB", "MB", "GB", "TB"] : null
                },
            });

            Plotly.newPlot(plot_element_id, plot_data, layout);
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
    if (!element) return;

    let by_region_summary_tsv_url = `${BASE_TSV_URL}/${dandiset_id}/by_region.tsv`;

    fetch(by_region_summary_tsv_url)
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

            let html = `<h3>${format_bytes(total_bytes)} sent to AWS data centers</h3>`;
            html += "<table><thead><tr><th>AWS Region</th><th>Bytes Sent</th></tr></thead><tbody>";
            subregion_data.forEach((r) => {
                html += `<tr><td>${r.name}</td><td>${format_bytes(r.bytes)}</td></tr>`;
            });
            html += "</tbody></table>";
            element.innerHTML = html;
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
                    GEOJSON_DATA = topojson.feature(topoData, topoData.objects[objectName]);
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
    const table_element = document.getElementById("top_regions_table");
    if (!table_element) return;

    fetch(by_region_summary_tsv_url)
        .then((response) => {
            if (!response.ok) throw new Error("Failed to fetch TSV");
            return response.text();
        })
        .then((text) => {
            const rows = text.split("\n").filter((row) => row.trim() !== "");
            if (rows.length < 2) {
                table_element.innerHTML = "";
                return;
            }

            const data = rows.slice(1).map((row) => row.split("\t"));

            // Filter out cloud regions, sort by bytes descending, take top 10
            const regions = data
                .filter((row) => {
                    const cc = row[0].split("/")[0];
                    return cc !== "AWS" && cc !== "GCP";
                })
                .map((row) => ({ region: row[0], bytes: parseInt(row[1], 10) }))
                .sort((a, b) => b.bytes - a.bytes)
                .slice(0, 10);

            if (regions.length === 0) {
                table_element.innerHTML = "";
                return;
            }

            let html = "<h3>Top 10 regions</h3>";
            html += "<table><thead><tr><th>Region</th><th>Bytes Sent</th></tr></thead><tbody>";
            regions.forEach((r) => {
                html += `<tr><td>${r.region}</td><td>${format_bytes(r.bytes)}</td></tr>`;
            });
            html += "</tbody></table>";
            table_element.innerHTML = html;
        })
        .catch(() => {
            table_element.innerHTML = "";
        });
}

// Function to fetch and render heatmap over geography
function load_geographic_heatmap(dandiset_id) {
    const plot_element_id = "geography_heatmap";
    let by_region_summary_tsv_url = `${BASE_TSV_URL}/${dandiset_id}/by_region.tsv`;

    load_top_regions_table(by_region_summary_tsv_url);

    if (USE_CHOROPLETH) {
        load_geographic_choropleth(dandiset_id, plot_element_id, by_region_summary_tsv_url);
        return;
    }

    if (!REGION_CODES_TO_LATITUDE_LONGITUDE) {
        console.error("Region coordinates not loaded");
        const plot_element = document.getElementById(plot_element_id);
        if (plot_element) {
            plot_element.innerText = "Failed to load data for geographic heatmap.";
        }
        return ""
    }

    fetch(by_region_summary_tsv_url)
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
                        opacity: 1,
                    },
                    text: hover_texts,
                    textposition: "none",
                    hoverinfo: "text",
                },
            ];

            const layout = applyDarkTheme({
                title: {
                    text: "Bytes sent by region",
                    font: { size: 24 },
                },
                geo: {
                    projection: { type: "equirectangular" },
                    bgcolor: DARK_THEME.surface,
                    lakecolor: DARK_THEME.bg,
                    landcolor: DARK_THEME.border,
                    showocean: true,
                    oceancolor: DARK_THEME.bg,
                    showlakes: true,
                    showland: true,
                    countrycolor: DARK_THEME.border,
                },
            });

            Plotly.newPlot(plot_element_id, plot_info, layout);
        })
        .catch((error) => {
            console.error("Error:", error);
            const plot_element = document.getElementById(plot_element_id);
            if (plot_element) {
                plot_element.innerText = "Failed to load data for geographic heatmap.";
            }
        });
}

// Function to fetch and render choropleth over geography
function load_geographic_choropleth(dandiset_id, plot_element_id, by_region_summary_tsv_url) {
    Promise.all([
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

        const layout = applyDarkTheme({
            title: {
                text: "Bytes sent by region",
                font: { size: 24 },
            },
            map: {
                style: "carto-darkmatter",
                center: { lat: 40, lon: 0 },
                zoom: defaultZoom,
                minzoom: minZoom,
            },
        });

        Plotly.newPlot(plot_element_id, plot_info, layout).then(() => {
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

// Function to format bytes into a human-readable string
function format_bytes(bytes, decimals = 2) {
    if (bytes === 0) return "0 Bytes";

    const k = USE_BINARY ? 1024 : 1000;
    const sizes = USE_BINARY ? ["Bytes", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"]: ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    const reduced = parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))

    return `${reduced} ${sizes[i]}`;
}
