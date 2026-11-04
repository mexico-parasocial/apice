import path from "path";
import { defineConfig } from "vitest/config";

// Unit tests for pure logic (lesson road geometry, offline queue, theme,
// hooks' request shapes). Components that need a native runtime are not
// tested here.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
