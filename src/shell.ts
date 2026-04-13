import { $ as bunDollar } from 'bun';
import { createRecordDriver, createReplayDriver, getRecording } from './shell/drivers.js';
import { createInvocation } from './shell/invocation.js';
import { RecordedShellError, ReplayExhaustedError, ReplayMismatchError } from './shell/output.js';
import { readReplayRecording } from './shell/recording-log.js';
import type {
	CreateShellOptions,
	CreateShellResult,
	RecordingShell,
	RecordingState,
	ShellExpression,
	ShellInvocation,
} from './shell/types.js';

export type {
	CreateShellOptions,
	CreateShellResult,
	RecordingShell,
	Shell,
	ShellInvocation,
	ShellOutputLike,
	ShellRecordingEntry,
} from './shell/types.js';
export { RecordedShellError, ReplayExhaustedError, ReplayMismatchError, readReplayRecording };

export function createShell<TOptions extends CreateShellOptions>(
	options: TOptions = { mode: 'passthrough' } as TOptions,
): CreateShellResult<TOptions> {
	if (options.mode === 'passthrough') {
		return ((strings: TemplateStringsArray, ...expressions: Array<ShellExpression>) =>
			createPassthroughInvocation(options, strings, expressions)) as CreateShellResult<TOptions>;
	} else if (options.mode === 'record') {
		const recording: RecordingState = {
			entries: [],
			pending: 0,
			logPath: options.recordingLogPath,
		};

		const shell = ((strings: TemplateStringsArray, ...expressions: Array<ShellExpression>) =>
			createInvocation(
				createRecordDriver(options, recording, strings, expressions),
			)) as RecordingShell;

		shell.getRecording = () => getRecording(recording);

		return shell;
	} else {
		const replay = { index: 0 };
		const recording: RecordingState = {
			entries:
				'recording' in options ? options.recording : readReplayRecording(options.recordingLogPath),
			pending: 0,
			logPath: undefined,
		};
		return ((strings: TemplateStringsArray, ...expressions: Array<ShellExpression>) =>
			createInvocation(
				createReplayDriver(recording.entries, replay, options.throws ?? true, strings, expressions),
			)) as CreateShellResult<TOptions>;
	}
}

function createPassthroughInvocation(
	options: CreateShellOptions,
	strings: TemplateStringsArray,
	expressions: Array<ShellExpression>,
): ShellInvocation {
	return createRawInvocation(options, strings, expressions) as unknown as ShellInvocation;
}

function createRawInvocation(
	options: CreateShellOptions,
	strings: TemplateStringsArray,
	expressions: Array<ShellExpression>,
) {
	let shell = bunDollar(strings, ...expressions);

	if (options.cwd !== undefined) {
		shell = shell.cwd(options.cwd);
	}
	if (options.env) {
		shell = shell.env(options.env);
	}
	if (options.throws !== undefined) {
		shell = shell.throws(options.throws);
	}

	return shell;
}
