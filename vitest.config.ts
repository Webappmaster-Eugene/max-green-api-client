import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({ plugins: [react()], resolve: { alias: { "@shared": path.resolve("src/shared") } }, test: { environment: "jsdom", include: ["webapp/src/**/*.test.tsx"], setupFiles: ["webapp/src/test-setup.ts"], restoreMocks: true } });
