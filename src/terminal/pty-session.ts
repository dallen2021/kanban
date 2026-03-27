import { existsSync, readFileSync } from "node:fs";
import { delimiter, extname, isAbsolute, join, resolve } from "node:path";
import * as pty from "node-pty";

const MAX_HISTORY_BYTES = 1024 * 1024;
const WINDOWS_CMD_META_CHARS_REGEXP = /([()\][%!^"`<>&|;, *?])/g;

export interface PtyExitEvent {
	exitCode: number;
	signal?: number;
}

export interface SpawnPtySessionRequest {
	binary: string;
	args?: string[] | string;
	cwd: string;
	env?: Record<string, string | undefined>;
	cols: number;
	rows: number;
	onData?: (chunk: Buffer) => void;
	onExit?: (event: PtyExitEvent) => void;
}

type PtyOutputChunk = string | Buffer | Uint8Array;

function normalizeOutputChunk(data: PtyOutputChunk): Buffer {
	if (typeof data === "string") {
		return Buffer.from(data, "utf8");
	}
	return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

function isIgnorablePtyWriteError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}
	const code = (error as NodeJS.ErrnoException).code;
	return code === "EIO" || code === "EBADF";
}

function isIgnorablePtyResizeError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}
	const code = (error as NodeJS.ErrnoException).code;
	if (code === "EIO" || code === "EBADF") {
		return true;
	}
	return /already exited/i.test(error.message);
}

function terminatePtyProcess(ptyProcess: pty.IPty): void {
	const pid = ptyProcess.pid;
	ptyProcess.kill();
	if (process.platform !== "win32" && Number.isFinite(pid) && pid > 0) {
		try {
			process.kill(-pid, "SIGTERM");
		} catch {
			// Best effort: process group may already be gone or inaccessible.
		}
	}
}

function resolveWindowsComSpec(): string {
	const comSpec = process.env.ComSpec?.trim() || process.env.COMSPEC?.trim();
	return comSpec || "cmd.exe";
}

function getWindowsPathEntries(env?: Record<string, string | undefined>): string[] {
	const rawPath = env?.PATH ?? env?.Path ?? process.env.PATH ?? process.env.Path ?? "";
	return rawPath
		.split(delimiter)
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

function resolveWindowsSearchCandidates(binary: string): string[] {
	const trimmed = binary.trim();
	if (!trimmed) {
		return [];
	}
	const extension = extname(trimmed).toLowerCase();
	if (extension) {
		return [trimmed];
	}
	return [`${trimmed}.exe`, `${trimmed}.cmd`, `${trimmed}.bat`, `${trimmed}.com`, trimmed];
}

function resolveWindowsBinaryPath(binary: string, env?: Record<string, string | undefined>): string | null {
	const trimmed = binary.trim();
	if (!trimmed) {
		return null;
	}
	const hasPathSeparator = trimmed.includes("\\") || trimmed.includes("/");
	const directCandidates = resolveWindowsSearchCandidates(trimmed);
	if (hasPathSeparator || isAbsolute(trimmed)) {
		for (const candidate of directCandidates) {
			const absoluteCandidate = resolve(candidate);
			if (existsSync(absoluteCandidate)) {
				return absoluteCandidate;
			}
		}
		return null;
	}
	for (const pathEntry of getWindowsPathEntries(env)) {
		for (const candidate of directCandidates) {
			const resolvedCandidate = join(pathEntry, candidate);
			if (existsSync(resolvedCandidate)) {
				return resolvedCandidate;
			}
		}
	}
	return null;
}

function tryResolveNpmCmdShimLaunch(
	resolvedBinaryPath: string,
	args: string[],
): { binary: string; args: string[] } | null {
	if (extname(resolvedBinaryPath).toLowerCase() !== ".cmd") {
		return null;
	}
	let content: string;
	try {
		content = readFileSync(resolvedBinaryPath, "utf8");
	} catch {
		return null;
	}
	const scriptMatch = content.match(/"%dp0%\\([^"\r\n]+?\.js)"/i);
	if (!scriptMatch) {
		return null;
	}
	const wrapperDir = resolve(resolvedBinaryPath, "..");
	const bundledNodePath = join(wrapperDir, "node.exe");
	const nodeBinary = existsSync(bundledNodePath) ? bundledNodePath : "node";
	const scriptRelativePath = scriptMatch[1]?.replaceAll("\\", "/");
	if (!scriptRelativePath) {
		return null;
	}
	const scriptPath = resolve(wrapperDir, scriptRelativePath);
	return {
		binary: nodeBinary,
		args: [scriptPath, ...args],
	};
}

function escapeWindowsCommand(value: string): string {
	return value.replace(WINDOWS_CMD_META_CHARS_REGEXP, "^$1");
}

function normalizeWindowsCmdArgument(value: string): string {
	return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n").replaceAll("\n", "\\n");
}

function escapeWindowsArgument(value: string): string {
	let escaped = normalizeWindowsCmdArgument(`${value}`);
	escaped = escaped.replace(/(?=(\\+?)?)\1"/g, "$1$1\\\"");
	escaped = escaped.replace(/(?=(\\+?)?)\1$/g, "$1$1");
	escaped = `"${escaped}"`;
	escaped = escaped.replace(WINDOWS_CMD_META_CHARS_REGEXP, "^$1");
	return escaped;
}

function buildWindowsCmdArgsCommandLine(binary: string, args: string[]): string {
	const escapedCommand = escapeWindowsCommand(binary);
	const escapedArgs = args.map((part) => escapeWindowsArgument(part));
	const shellCommand = [escapedCommand, ...escapedArgs].join(" ");
	return `/d /s /c "${shellCommand}"`;
}

function shouldUseWindowsShellLaunch(binary: string): boolean {
	if (process.platform !== "win32") {
		return false;
	}
	const normalized = binary.trim().toLowerCase();
	if (!normalized) {
		return false;
	}
	if (normalized === "cmd" || normalized === "cmd.exe") {
		return false;
	}
	return normalized !== resolveWindowsComSpec().toLowerCase();
}

function resolveWindowsDirectLaunch(
	binary: string,
	args: string[],
	env?: Record<string, string | undefined>,
): { binary: string; args: string[] } | null {
	const resolvedBinaryPath = resolveWindowsBinaryPath(binary, env);
	if (!resolvedBinaryPath) {
		return null;
	}
	const extension = extname(resolvedBinaryPath).toLowerCase();
	if (extension === ".exe" || extension === ".com") {
		return {
			binary: resolvedBinaryPath,
			args,
		};
	}
	return tryResolveNpmCmdShimLaunch(resolvedBinaryPath, args);
}

export class PtySession {
	private readonly ptyProcess: pty.IPty;
	private readonly outputHistory: Buffer[] = [];
	private historyBytes = 0;
	private interrupted = false;
	private exited = false;

	private constructor(
		ptyProcess: pty.IPty,
		private readonly onDataCallback?: (chunk: Buffer) => void,
		private readonly onExitCallback?: (event: PtyExitEvent) => void,
	) {
		this.ptyProcess = ptyProcess;
		(this.ptyProcess.onData as unknown as (listener: (data: PtyOutputChunk) => void) => void)((data) => {
			const chunk = normalizeOutputChunk(data);
			this.outputHistory.push(chunk);
			this.historyBytes += chunk.byteLength;
			while (this.historyBytes > MAX_HISTORY_BYTES && this.outputHistory.length > 0) {
				const shifted = this.outputHistory.shift();
				if (!shifted) {
					break;
				}
				this.historyBytes -= shifted.byteLength;
			}
			this.onDataCallback?.(chunk);
		});
		this.ptyProcess.onExit((event) => {
			this.exited = true;
			this.onExitCallback?.(event);
		});
	}

	static spawn({ binary, args = [], cwd, env, cols, rows, onData, onExit }: SpawnPtySessionRequest): PtySession {
		const normalizedArgs = typeof args === "string" ? [args] : args;
		const terminalName = env?.TERM?.trim() || process.env.TERM?.trim() || "xterm-256color";
		const directWindowsLaunch =
			process.platform === "win32" ? resolveWindowsDirectLaunch(binary, normalizedArgs, env) : null;
		const useWindowsShellLaunch =
			!directWindowsLaunch && shouldUseWindowsShellLaunch(binary);
		const spawnBinary = directWindowsLaunch?.binary ?? (useWindowsShellLaunch ? resolveWindowsComSpec() : binary);
		const spawnArgs = directWindowsLaunch?.args ??
			(useWindowsShellLaunch ? buildWindowsCmdArgsCommandLine(binary, normalizedArgs) : normalizedArgs);
		const ptyOptions: pty.IPtyForkOptions = {
			name: terminalName,
			cwd,
			env,
			cols,
			rows,
			encoding: null,
		};

		const ptyProcess = pty.spawn(spawnBinary, spawnArgs, ptyOptions);
		return new PtySession(ptyProcess, onData, onExit);
	}

	get pid(): number {
		return this.ptyProcess.pid;
	}

	getOutputHistory(): readonly Buffer[] {
		return this.outputHistory;
	}

	write(data: string | Buffer): void {
		try {
			this.ptyProcess.write(typeof data === "string" ? data : data.toString("utf8"));
		} catch (error) {
			if (isIgnorablePtyWriteError(error)) {
				return;
			}
			throw error;
		}
	}

	resize(cols: number, rows: number, pixelWidth?: number, pixelHeight?: number): void {
		if (this.exited) {
			return;
		}
		try {
			if (pixelWidth !== undefined && pixelHeight !== undefined) {
				this.ptyProcess.resize(cols, rows, {
					width: pixelWidth,
					height: pixelHeight,
				});
				return;
			}
			this.ptyProcess.resize(cols, rows);
		} catch (error) {
			if (isIgnorablePtyResizeError(error)) {
				this.exited = true;
				return;
			}
			throw error;
		}
	}

	pause(): void {
		this.ptyProcess.pause();
	}

	resume(): void {
		this.ptyProcess.resume();
	}

	stop(options?: { interrupted?: boolean }): void {
		if (options?.interrupted) {
			this.interrupted = true;
		}
		terminatePtyProcess(this.ptyProcess);
	}

	wasInterrupted(): boolean {
		return this.interrupted;
	}
}
