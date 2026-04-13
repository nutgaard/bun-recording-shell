import { $ as bunDollar } from 'bun';
import {
	RecordedShellError,
	ReplayExhaustedError,
	ReplayMismatchError,
	ShellOutput,
	toRecordedShellError,
} from './output.js';
import { toRecordingEntry, writeRecordingLog } from './recording-log.js';
import { renderCommand } from './render-command.js';
import type {
	BaseShellOptions,
	BunShell,
	CreateShellOptions,
	InvocationDriver,
	RecordingState,
	ReplayState,
	ShellExpression,
	ShellOutputLike,
	ShellRecordingEntry,
} from './types.js';

export function getRecording(recording: RecordingState): Array<ShellRecordingEntry> {
	if (recording.pending > 0) {
		throw new Error('Recording is incomplete while commands are still in flight');
	}

	return recording.entries
		.filter((entry): entry is ShellRecordingEntry => entry !== null)
		.map((entry) => ({ ...entry }));
}

export function createRecordDriver(
	options: Extract<CreateShellOptions, { mode: 'record' }>,
	recording: RecordingState,
	strings: TemplateStringsArray,
	expressions: Array<ShellExpression>,
): InvocationDriver {
	let shell = createLiveShell(options, strings, expressions);
	let cwd = options.cwd;
	let settled: Promise<ShellOutputLike> | undefined;

	return {
		run() {
			if (!settled) {
				const recordIndex = reserveRecording(recording);
				const command = renderCommand(strings, expressions, false);
				settled = runRecordedShell(shell, command, cwd, recording, recordIndex);
			}
			return settled;
		},
		cwd(newCwd: string) {
			cwd = newCwd;
			shell = shell.cwd(newCwd);
		},
		env(newEnv: Record<string, string | undefined> | undefined) {
			shell = shell.env(newEnv);
		},
		quiet(isQuiet: boolean) {
			shell = shell.quiet(isQuiet);
		},
		throws(shouldThrow: boolean) {
			shell = shell.throws(shouldThrow);
		},
	};
}

export function createReplayDriver(
	entries: Array<ShellRecordingEntry | null>,
	replay: { index: number },
	initialThrows: boolean,
	strings: TemplateStringsArray,
	expressions: Array<ShellExpression>,
): InvocationDriver {
	const state: ReplayState = {
		throws: initialThrows,
	};
	let settled: Promise<ShellOutputLike> | undefined;

	return {
		run() {
			if (!settled) {
				const command = renderCommand(strings, expressions, true);
				const entry = entries[replay.index];

				if (!entry) {
					settled = Promise.reject(new ReplayExhaustedError(replay.index, command));
				} else if (entry.command !== command) {
					settled = Promise.reject(new ReplayMismatchError(replay.index, entry.command, command));
				} else {
					replay.index += 1;
					const output = new ShellOutput(entry.stdout, entry.stderr, entry.exitCode);
					settled =
						state.throws && output.exitCode !== 0
							? Promise.reject(
									new RecordedShellError(command, output.stdout, output.stderr, output.exitCode),
								)
							: Promise.resolve(output);
				}
			}

			return settled;
		},
		throws(shouldThrow: boolean) {
			state.throws = shouldThrow;
		},
	};
}

function createLiveShell(
	options: BaseShellOptions,
	strings: TemplateStringsArray,
	expressions: Array<ShellExpression>,
): BunShell {
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

async function runRecordedShell(
	shell: BunShell,
	command: string,
	cwd: string | undefined,
	recording: RecordingState,
	recordIndex: number,
): Promise<ShellOutputLike> {
	writeRecordingLog(recording.logPath, {
		timestamp: new Date().toISOString(),
		recordIndex,
		phase: 'started',
		command,
		cwd,
	});

	try {
		const result = await shell;
		const output = new ShellOutput(result.stdout, result.stderr, result.exitCode);
		recording.entries[recordIndex] = toRecordingEntry(command, output);
		recording.pending -= 1;
		writeRecordingLog(recording.logPath, {
			timestamp: new Date().toISOString(),
			recordIndex,
			phase: 'finished',
			command,
			cwd,
			exitCode: output.exitCode,
			stdout: output.stdout.toString(),
			stderr: output.stderr.toString(),
		});
		return output;
	} catch (error) {
		const wrapped = toRecordedShellError(command, error);
		recording.pending -= 1;

		if (wrapped) {
			recording.entries[recordIndex] = toRecordingEntry(command, wrapped);
			writeRecordingLog(recording.logPath, {
				timestamp: new Date().toISOString(),
				recordIndex,
				phase: 'failed',
				command,
				cwd,
				exitCode: wrapped.exitCode,
				stdout: wrapped.stdout.toString(),
				stderr: wrapped.stderr.toString(),
			});
		}

		throw wrapped ?? error;
	}
}

function reserveRecording(recording: RecordingState): number {
	recording.pending += 1;
	recording.entries.push(null);
	return recording.entries.length - 1;
}
