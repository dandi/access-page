import { defineConfig } from "vite";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));

export default defineConfig({
    root: "src",
    publicDir: "../config",
    base: "./",
    build: {
        outDir: "../dist",
        emptyOutDir: true,
    },
    define: {
        __APP_VERSION__: JSON.stringify(version),
    },
});
