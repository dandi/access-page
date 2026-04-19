import { defineConfig } from "vite";

export default defineConfig({
    root: "src",
    publicDir: "../public",
    base: "./",
    build: {
        outDir: "../dist",
        emptyOutDir: true,
    },
});
