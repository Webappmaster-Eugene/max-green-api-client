import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({ plugins: [react()], resolve: { alias: { "@shared": path.resolve("src/shared") } }, server: { port: 5174, proxy: { "/api": "http://127.0.0.1:18792" } }, build: { outDir: "dist/client", target: ["es2020", "safari14"] } });
