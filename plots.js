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
            load_per_asset_histogram(selected_dandiset);
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
            load_per_asset_histogram(selected_dandiset);
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
            load_per_asset_histogram(selected_dandiset);
            load_geographic_heatmap(selected_dandiset);
        });
    }
});

// Add an event listener for window resize
window.addEventListener("resize", resizePlots);

function resizePlots() {
    // Select the div elements
    const overTimePlot = document.getElementById("over_time_plot");
    const perAssetHistogram = document.getElementById("per_asset_histogram");
    const geographyHeatmap = document.getElementById("geography_heatmap");

    const dandiset_selector = document.getElementById("dandiset_selector");
    const selected_dandiset = dandiset_selector.value;

    // Update their sizes dynamically
    if (overTimePlot) {
        overTimePlot.style.width = "90vw";
        overTimePlot.style.height = "80vh";
        Plotly.relayout(overTimePlot, { width: overTimePlot.offsetWidth, height: overTimePlot.offsetHeight });
    }
    if (selected_dandiset !== "archive" && perAssetHistogram) {
        perAssetHistogram.style.width = "90vw";
        perAssetHistogram.style.height = "80vh";
        Plotly.relayout(perAssetHistogram, { width: perAssetHistogram.offsetWidth, height: perAssetHistogram.offsetHeight });
    }
    if (geographyHeatmap) {
        geographyHeatmap.style.width = "90vw";
        geographyHeatmap.style.height = "80vh";
        geographyHeatmap.style.margin = "auto";
        Plotly.relayout(geographyHeatmap, { width: geographyHeatmap.offsetWidth, height: geographyHeatmap.offsetHeight });
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

        // Load the plot for the first ID by default
        update_totals("archive");
        load_over_time_plot("archive");
        load_per_asset_histogram("archive");
        load_geographic_heatmap("archive");

        // Update the plots when a new Dandiset ID is selected
        selector.addEventListener("change", (event) => {
            const target = event.target;
            update_totals(target.value);
            load_over_time_plot(target.value);
            load_per_asset_histogram(target.value);
            load_geographic_heatmap(target.value);
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
        totals_element.innerHTML = `A total of ${human_readable_bytes_sent} was sent to ${totals.number_of_unique_regions} regions across ${totals.number_of_unique_countries} countries. <sup>*</sup>`;

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

// Function to fetch and render histogram over asset IDs
function load_per_asset_histogram(dandiset_id) {
    const plot_element_id = "per_asset_histogram";
    let by_asset_summary_tsv_url = "";

    // Suppress div element content if 'archive' is selected
    if (dandiset_id === "archive") {
        const plot_element = document.getElementById(plot_element_id);
        if (plot_element) {
            plot_element.innerText = "";
        }
        return "";
    } else {
        by_asset_summary_tsv_url = `${BASE_TSV_URL}/${dandiset_id}/by_asset.tsv`;
    }

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
                const filename = row[0].split("/").at(-1);
                const suffix = filename.split(".").at(-1);

                if (suffix !== "nwb" && suffix !== "mp4" && suffix !== "avi") {
                    throw new Error("Currently only supports NWB files.");
                }

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

// Function to fetch and render heatmap over geography
function load_geographic_heatmap(dandiset_id) {
    const plot_element_id = "geography_heatmap";
    let by_region_summary_tsv_url = `${BASE_TSV_URL}/${dandiset_id}/by_region.tsv`;

    if (!REGION_CODES_TO_LATITUDE_LONGITUDE) {
        console.error("Error:", error);
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

            const prefix = USE_BINARY ? "i" : ""
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
                    text: "Bytes Sent by Region",
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

// Function to format bytes into a human-readable string
function format_bytes(bytes, decimals = 2) {
    if (bytes === 0) return "0 Bytes";

    const k = USE_BINARY ? 1024 : 1000;
    const sizes = USE_BINARY ? ["Bytes", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"]: ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    const reduced = parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))

    return `${reduced} ${sizes[i]}`;
}
