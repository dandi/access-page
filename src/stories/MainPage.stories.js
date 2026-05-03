import "../../styles.css";

export default {
    title: "DANDI Access Page/Main Page",
};

/**
 * Renders the full page skeleton as seen on initial load.
 * Network requests for live data will not resolve in Storybook; plot containers
 * remain empty, which is the intended state for visual regression testing of
 * the layout and static chrome.
 */
export const Default = {
    render: () => {
        // Set default dark theme so the story starts in a known state
        document.documentElement.setAttribute("data-theme", "dark");

        return `
<header class="site-header">
  <div class="header-content">
    <div class="header-logo-title">
      <img src="./assets/dandi-usage-logo.svg" alt="DANDI logo" class="header-logo" />
      <h1 class="header-title">DANDI Usage Statistics</h1>
    </div>
    <button id="theme_toggle_btn" class="theme-toggle-btn" aria-label="Switch to light mode" title="Switch to light mode">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"/>
      </svg>
    </button>
  </div>
</header>
<main class="main-content">
  <div id="totals" class="totals-section">Loading usage data…</div>
</main>`;
    },
};

export const LightTheme = {
    render: () => {
        document.documentElement.setAttribute("data-theme", "light");
        return Default.render();
    },
};
