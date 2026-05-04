// Function to handle Plotly loading errors
// Can happen if version or CDN is not properly specified or otherwise unavailable
export function handlePlotlyError(): void {
    console.error('Failed to load Plotly library.');
    document.body.innerHTML = '<h1>Error: Plotly library could not be loaded.</h1>';
}
