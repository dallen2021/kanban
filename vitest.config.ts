import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		exclude: ["apps/**", "**/node_modules/**", "**/dist/**"],
	},
});
