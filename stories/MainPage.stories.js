import rawHTML from "../src/index.html?raw";

export default {
    title: "DANDI Access Page/Main Page",
};

/**
 * Full page HTML derived from index.html via ?raw import so it always stays
 * in sync with the source.  Network requests for live data will not resolve;
 * plot containers remain empty, which is the intended state for visual
 * regression testing.
 *
 * Only the <body> content is extracted: the inline <head> script that adds
 * the `preload` class to <html> never runs, so the body stays visible without
 * plots.js needing to remove it.
 */
const bodyMatch = rawHTML.match(/<body[^>]*>([\s\S]*)<\/body>/i);
const pageHTML = bodyMatch ? bodyMatch[1] : "";

export const DarkTheme = {
    render: () => {
        document.documentElement.setAttribute("data-theme", "dark");
        return pageHTML;
    },
};

export const LightTheme = {
    render: () => {
        document.documentElement.setAttribute("data-theme", "light");
        return pageHTML;
    },
};
