/**
 * Pure utility functions shared across the application.
 * All exports here are side-effect-free and have no DOM or Plotly dependencies,
 * making them straightforward to unit test.
 */

/**
 * Sets or deletes a URL query parameter based on whether value equals the
 * default value.  Non-default values are written to the URL; default values
 * are omitted so that the base entry URL stays clean.
 *
 * @param {URLSearchParams} params - The URLSearchParams instance to mutate.
 * @param {string} key - The query parameter name.
 * @param {string} value - The current value.
 * @param {string} defaultValue - The default value (omitted from URL).
 */
export function setUrlParam(params, key, value, defaultValue) {
    if (value === defaultValue) {
        params.delete(key);
    } else {
        params.set(key, value);
    }
}

/**
 * Converts a color string (hex or rgba) to an rgba string with the given alpha.
 * Used to produce semi-transparent fill colors from line colors.
 *
 * @param {string} color - A hex (#rrggbb) or rgb/rgba color string.
 * @param {number} alpha - Alpha value between 0 and 1.
 * @returns {string}
 */
export function color_with_alpha(color, alpha) {
    const rgba_match = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgba_match) {
        return `rgba(${rgba_match[1]},${rgba_match[2]},${rgba_match[3]},${alpha})`;
    }
    const hex_match = color.match(/^#([0-9a-fA-F]{6})$/);
    if (hex_match) {
        const r = parseInt(hex_match[1].slice(0, 2), 16);
        const g = parseInt(hex_match[1].slice(2, 4), 16);
        const b = parseInt(hex_match[1].slice(4, 6), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }
    return color;
}

/**
 * Parses a by_day TSV text string and returns { dates, bytes }.
 *
 * @param {string} text - TSV text with a header row and date/bytes columns.
 * @returns {{ dates: string[], bytes: number[] }}
 */
export function parse_by_day_tsv(text) {
    const rows = text.split("\n").filter((row) => row.trim() !== "");
    if (rows.length < 2) throw new Error("TSV file does not contain enough data.");
    const raw_data = rows.slice(1).map((row) => row.split("\t"));
    return {
        dates: raw_data.map((row) => row[0]),
        bytes: raw_data.map((row) => parseInt(row[1], 10)),
    };
}

/**
 * Parses a by_asset_type_per_week TSV text string.
 * Returns { dates, asset_types, series_map } where:
 *   - dates: string[] of week_start dates
 *   - asset_types: string[] of column names (excluding week_start)
 *   - series_map: Map from asset_type -> number[] of weekly bytes
 *
 * @param {string} text - TSV text with a header row.
 * @returns {{ dates: string[], asset_types: string[], series_map: Map<string, number[]> }}
 */
export function parse_by_asset_type_per_week_tsv(text) {
    const rows = text.split("\n").filter((row) => row.trim() !== "");
    if (rows.length < 2) throw new Error("TSV file does not contain enough data.");
    const headers = rows[0].split("\t");
    const asset_types = headers.slice(1);
    const data_rows = rows.slice(1).map((row) => row.split("\t"));
    const dates = data_rows.map((row) => row[0]);
    const series_map = new Map();
    asset_types.forEach((type, col_idx) => {
        series_map.set(type, data_rows.map((row) => parseInt(row[col_idx + 1], 10) || 0));
    });
    return { dates, asset_types, series_map };
}

/**
 * Aggregates arrays of daily dates and byte counts into coarser time bins.
 *
 * @param {string[]} dates - ISO date strings ("YYYY-MM-DD").
 * @param {number[]} bytes_sent - Byte counts for each corresponding date.
 * @param {string} aggregation - One of "daily" | "weekly" | "monthly" | "yearly".
 * @returns {{ dates: string[], bytes_sent: number[] }}
 */
export function aggregate_by_timebin(dates, bytes_sent, aggregation) {
    if (aggregation === "daily") {
        return { dates, bytes_sent };
    }

    const bin_map = new Map();
    dates.forEach((date_str, i) => {
        const date = new Date(date_str + "T00:00:00Z");
        let bin_key;
        if (aggregation === "weekly") {
            // Find the Monday (ISO week start) for this date
            const day_of_week = date.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
            const days_to_monday = day_of_week === 0 ? -6 : 1 - day_of_week;
            const monday = new Date(date);
            monday.setUTCDate(date.getUTCDate() + days_to_monday);
            bin_key = monday.toISOString().slice(0, 10);
        } else if (aggregation === "monthly") {
            bin_key = date_str.slice(0, 7); // "YYYY-MM"
        } else { // "yearly"
            bin_key = date_str.slice(0, 4); // "YYYY"
        }
        bin_map.set(bin_key, (bin_map.get(bin_key) || 0) + bytes_sent[i]);
    });

    // ISO strings sort lexicographically, so this preserves chronological order
    const sorted_keys = Array.from(bin_map.keys()).sort();
    return {
        dates: sorted_keys,
        bytes_sent: sorted_keys.map((k) => bin_map.get(k)),
    };
}

/**
 * Formats a byte count into a human-readable string using either binary (1024)
 * or decimal (1000) prefixes.
 *
 * @param {number} bytes - The byte count to format.
 * @param {number} [decimals=2] - Number of decimal places.
 * @param {boolean} [use_binary=false] - When true uses 1024-based (KiB/MiB/…) prefixes.
 * @returns {string}
 */
export function format_bytes(bytes, decimals = 2, use_binary = false) {
    if (bytes === 0) return "0 Bytes";

    const k = use_binary ? 1024 : 1000;
    const sizes = use_binary
        ? ["Bytes", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"]
        : ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    const reduced = parseFloat((bytes / Math.pow(k, i)).toFixed(decimals));

    return `${reduced} ${sizes[i]}`;
}
