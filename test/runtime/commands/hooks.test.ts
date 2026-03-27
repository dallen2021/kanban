import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { resolveCodexWrapperSpawnLaunch } from "../../../src/commands/hooks.js";

const originalPlatform = process.platform;
const originalComSpec = process.env.ComSpec;
const originalCOMSPEC = process.env.COMSPEC;
const originalPath = process.env.PATH;
const originalPathLower = process.env.Path;

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
		if (originalPath === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = originalPath;
		}
		if (originalPathLower === undefined) {
			delete process.env.Path;
		} else {
			process.env.Path = originalPathLower;
		}
	});

	it("launches npm cmd shims through node directly on Windows", () => {
		setPlatform("win32");
		process.env.ComSpec = "C:\\Windows\\System32\\cmd.exe";
		const tempDir = mkdtempSync(join(tmpdir(), "kanban-hooks-shim-"));
		const nodePath = join(tempDir, "node.exe");
		const shimPath = join(tempDir, "codex.cmd");
		mkdirSync(join(tempDir, "node_modules", "@openai", "codex", "bin"), { recursive: true });
		writeFileSync(nodePath, "");
		writeFileSync(
			shimPath,
			'@ECHO off\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n',
		);
		process.env.PATH = tempDir;
		process.env.Path = tempDir;

		const launch = resolveCodexWrapperSpawnLaunch("codex", ["help"]);

		expect(launch).toEqual({
			binary: nodePath,
			args: [join(tempDir, "node_modules", "@openai", "codex", "bin", "codex.js"), "help"],
			shell: false,
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

	it("prefers real executables over npm shims on Windows", () => {
		setPlatform("win32");
		process.env.ComSpec = "C:\\Windows\\System32\\cmd.exe";
		const tempDir = mkdtempSync(join(tmpdir(), "kanban-hooks-exe-"));
		const exePath = join(tempDir, "codex.exe");
		const shimPath = join(tempDir, "codex.cmd");
		writeFileSync(exePath, "");
		writeFileSync(shimPath, "@ECHO off\r\n");
		process.env.PATH = tempDir;
		process.env.Path = tempDir;

		const launch = resolveCodexWrapperSpawnLaunch("codex", ["help"]);

		expect(launch).toEqual({
			binary: exePath,
			args: ["help"],
			shell: false,
		});
	});
});
