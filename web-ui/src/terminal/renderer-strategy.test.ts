import { describe, expect, it } from "vitest";

import { shouldEnableTerminalWebgl } from "@/terminal/renderer-strategy";

describe("terminal renderer strategy", () => {
	it("disables WebGL on Windows", () => {
		expect(
			shouldEnableTerminalWebgl({
				isWindowsPlatform: true,
			}),
		).toBe(false);
	});

	it("keeps WebGL enabled on non-Windows platforms", () => {
		expect(
			shouldEnableTerminalWebgl({
				isWindowsPlatform: false,
			}),
		).toBe(true);
	});
});
