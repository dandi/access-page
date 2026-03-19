// TODO: if using a proper framework/package structure, import the error helper
// (working for the moment due to global import in the index.html file)

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
let USE_CHOROPLETH = false;
let GEOJSON_DATA = null;
let NAME_ALIASES = null;



// Check if Plotly is loaded after the window loads
window.addEventListener("load", () => {
    if (typeof Plotly === "undefined") {
        handlePlotlyError();
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
        cumulativeCheckbox.addEventListener("change", function () {
            USE_CUMULATIVE = this.checked;

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

    // Add event listener for choropleth toggle
    const choroplethCheckbox = document.getElementById("choropleth");
    if (choroplethCheckbox) {
        choroplethCheckbox.addEventListener("change", function() {
            USE_CHOROPLETH = this.checked;

            const dandiset_selector = document.getElementById("dandiset_selector");
            const selected_dandiset = dandiset_selector.value;

            load_geographic_heatmap(selected_dandiset);
        });
    }
});

// Add an event listener for window resize
window.addEventListener("resize", resizePlots);

function resizePlots() {
    // Select the div elements
    const over_time_plot = document.getElementById("over_time_plot");
    const histogram = document.getElementById("histogram");
    const geography_heatmap = document.getElementById("geography_heatmap");

    const dandiset_selector = document.getElementById("dandiset_selector");
    const selected_dandiset = dandiset_selector.value;

    // Update their sizes dynamically
    if (over_time_plot) {
        over_time_plot.style.width = "90vw";
        over_time_plot.style.height = "80vh";
        Plotly.relayout(over_time_plot, { width: over_time_plot.offsetWidth, height: over_time_plot.offsetHeight });
    }
    if (selected_dandiset !== "archive" && histogram) {
        histogram.style.width = "90vw";
        histogram.style.height = "80vh";
        Plotly.relayout(histogram, { width: histogram.offsetWidth, height: histogram.offsetHeight });
    }
    if (geography_heatmap) {
        geography_heatmap.style.width = "90vw";
        geography_heatmap.style.height = "80vh";
        geography_heatmap.style.margin = "auto";
        Plotly.relayout(geography_heatmap, { width: geography_heatmap.offsetWidth, height: geography_heatmap.offsetHeight });
    }
}



fetch(REGION_CODES_TO_LATITUDE_LONGITUDE_URL)
    .then((response) => {
        if (!response.ok) {
            throw new Error(`Failed to fetch YAML file: ${response.statusText}`);
        }
        return response.text();
    })
    .then((data) => {
        REGION_CODES_TO_LATITUDE_LONGITUDE = jsyaml.load(data);
    })
    .catch((error) => {
        console.error("Error loading YAML file:", error);
    });

fetch(ARCHIVE_TOTALS_URL)
    .then((response) => {
        if (!response.ok) {
            throw new Error(`Failed to fetch archive totals: ${response.statusText}`);
        }
        return response.text();
    })
    .then((archive_totals_text) => {
        ALL_DANDISET_TOTALS["archive"] = JSON.parse(archive_totals_text);
    })
    .catch((error) => {
        console.error("Error:", error);

        // Only overlay error message over first plot element
        const totals_element = document.getElementById("totals");
        if (totals_element) {
            totals_element.innerText = "Failed to load data for archive totals.";
        }
    });

// Populate the dropdown with IDs and render initial plots
fetch(ALL_DANDISET_TOTALS_URL)
    .then((response) => {
        if (!response.ok) {
            throw new Error(`Failed to fetch available Dandiset IDs: ${response.statusText}`);
        }
        return response.text();
    })
    .then((all_dandiset_totals_text) => {
        Object.assign(ALL_DANDISET_TOTALS, JSON.parse(all_dandiset_totals_text));
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
                }
            ];

            const layout = {
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
            };

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
            }
        ];

        const layout = {
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
        };

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
                }
            ];

            const layout = {
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
            };

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

// Function to fetch and render histogram over AWS regions
function load_aws_histogram(dandiset_id) {
    const plot_element_id = "aws_histogram";
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
                throw new Error("TSV file does not contain enough data.");
            }

            const data = rows.slice(1).map((row) => row.split("\t"));
            const subregion_data = [];

            data.forEach((row) => {
                const region = row[0];
                if (!region.startsWith("AWS/")) return;
                const region_clipped = region.replace("AWS/", "");
                const bytes = parseInt(row[1], 10);
                subregion_data.push({
                    name: region_clipped,
                    bytes: bytes,
                    human: format_bytes(bytes)
                });
            });

            // Sort descending by bytes
            subregion_data.sort((a, b) => b.bytes - a.bytes);

            const subregion_names = subregion_data.map(item => item.name);
            const bytes_sent = subregion_data.map(item => item.bytes);
            const human_readable_bytes_sent = subregion_data.map(item => item.human);

            const total_bytes_sent = subregion_data.reduce((acc, item) => acc + item.bytes, 0);
            const summary_text = `${format_bytes(total_bytes_sent)} in total sent to AWS data centers`;

            const plot_data = [
                {
                    type: "bar",
                    x: subregion_names,
                    y: bytes_sent,
                    text: subregion_names.map((name, index) => `${name}<br>${human_readable_bytes_sent[index]}`),
                    textposition: "none",
                    hoverinfo: "text",
                }
            ];

            const layout = {
                bargap: 0,
                title: {
                    text: summary_text,
                    font: { size: 24 }
                },
                xaxis: {
                    title: {
                        text: "(hover over an entry for AWS subregions)",
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
            };

            Plotly.newPlot(plot_element_id, plot_data, layout);
        })
        .catch((error) => {
            console.error("Error:", error);
            const plot_element = document.getElementById(plot_element_id);
            if (plot_element) {
                plot_element.innerText = "";
            }
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

// Function to fetch and render heatmap over geography
function load_geographic_heatmap(dandiset_id) {
    const plot_element_id = "geography_heatmap";
    let by_region_summary_tsv_url = `${BASE_TSV_URL}/${dandiset_id}/by_region.tsv`;

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
                        color: USE_LOG_SCALE ? bytes_sent.map(bytes => Math.log10(Math.max(1, bytes))) : bytes_sent,
                        colorscale: "Viridis",
                        colorbar: {
                            title: USE_LOG_SCALE ? "Bytes (log scale)" : "Bytes",
                            tickformat: USE_LOG_SCALE ? "" : "~s",
                            ticksuffix: USE_LOG_SCALE ? "" : "B",
                            tickvals: USE_LOG_SCALE ? [3, 6, 9, 12] : null,
                            ticktext: USE_LOG_SCALE ? ["KB", "MB", "GB", "TB"] : null
                        },
                        opacity: 1,
                    },
                    text: hover_texts,
                    textposition: "none",
                    hoverinfo: "text",
                },
            ];

            const layout = {
                title: {
                    text: "Bytes sent by region",
                    font: { size: 24 },
                },
                geo: {
                    projection: {
                        type: "equirectangular",
                    },
                },
            };

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

        // Skip features whose geometry spans the entire map (dateline-crossing)
        const SKIP_IDS = new Set([0, 909, 910, 2109, 2511, 3271]);

        feature_bytes.forEach((bytes, idx) => {
            if (bytes > 0) {
                const feature = GEOJSON_DATA.features[idx];
                if (SKIP_IDS.has(feature.properties.id)) return;
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

        const layout = {
            title: {
                text: "Bytes sent by region (choropleth)",
                font: { size: 24 },
            },
            map: {
                style: "carto-positron",
                center: { lat: 30, lon: 0 },
                zoom: 1,
            },
        };

        Plotly.newPlot(plot_element_id, plot_info, layout);
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
