import { afterEach, describe, expect, it } from "vitest";

import { resolveCodexWrapperSpawnLaunch } from "../../../src/commands/hooks.js";

const originalPlatform = process.platform;
const originalComSpec = process.env.ComSpec;
const originalCOMSPEC = process.env.COMSPEC;

function setPlatform(value: NodeJS.Platform): void {
	Object.defineProperty(process, "platform", {
		value,
		configurable: true,
	});
}

describe("resolveCodexWrapperSpawnLaunch", () => {
	afterEach(() => {
		setPlatform(originalPlatform);
		if (originalComSpec === undefined) {
			delete process.env.ComSpec;
		} else {
			process.env.ComSpec = originalComSpec;
		}
		if (originalCOMSPEC === undefined) {
			delete process.env.COMSPEC;
		} else {
			process.env.COMSPEC = originalCOMSPEC;
		}
	});

	it("routes bare codex launches through cmd on Windows", () => {
		setPlatform("win32");

		const launch = resolveCodexWrapperSpawnLaunch("codex", ["help"]);

		expect(launch).toEqual({
			binary: "codex",
			args: ["help"],
			shell: true,
		});
	});

	it("keeps direct process launch on non-Windows platforms", () => {
		setPlatform("darwin");

		const launch = resolveCodexWrapperSpawnLaunch("codex", ["help"]);

		expect(launch).toEqual({
			binary: "codex",
			args: ["help"],
			shell: false,
		});
	});
});
