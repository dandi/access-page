import { describe, it, expect, vi, beforeEach } from "vitest";

describe("handlePlotlyError", () => {
    beforeEach(() => {
        // Reset body and spy between tests
        document.body.innerHTML = "";
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it("logs a console error", async () => {
        const { handlePlotlyError } = await import("../../src/errors.ts");
        handlePlotlyError();
        expect(console.error).toHaveBeenCalledWith("Failed to load Plotly library.");
    });

    it("replaces the document body with an error heading", async () => {
        const { handlePlotlyError } = await import("../../src/errors.ts");
        handlePlotlyError();
        expect(document.body.innerHTML).toBe("<h1>Error: Plotly library could not be loaded.</h1>");
    });
});
