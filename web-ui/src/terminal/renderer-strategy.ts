interface TerminalRendererStrategyInput {
	isWindowsPlatform: boolean;
}

export function shouldEnableTerminalWebgl({
	isWindowsPlatform,
}: TerminalRendererStrategyInput): boolean {
	// Windows GPUs + Codex's aggressive full-screen terminal repainting have
	// shown cursor artifacts in the embedded xterm view. Keep Windows on the
	// default renderer path until WebGL behaves reliably there.
	return !isWindowsPlatform;
}
