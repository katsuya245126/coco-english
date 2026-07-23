import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: [
      "tests/**/*.test.ts",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
    ],
    setupFiles: ["./tests/setup-realtime-stub.ts"],
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
