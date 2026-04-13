import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ShellOutputLike, ShellRecordingEntry } from './types.js';

type ShellRecordingLogEntry =
	| {
			timestamp: string;
			recordIndex: number;
			phase: 'started';
			command: string;
			cwd: string | undefined;
	  }
	| {
			timestamp: string;
			recordIndex: number;
			phase: 'finished' | 'failed';
			command: string;
			cwd: string | undefined;
			exitCode: number;
			stdout: string;
			stderr: string;
	  };

export function writeRecordingLog(
	logPath: string | undefined,
	entry: ShellRecordingLogEntry,
): void {
	if (logPath === undefined) {
		return;
	}

	mkdirSync(dirname(logPath), { recursive: true });
	appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
}

export function readReplayRecording(logPath: string): Array<ShellRecordingEntry> {
	return readFileSync(logPath, 'utf8')
		.trim()
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line) as ShellRecordingLogEntry)
		.filter((it) => it.phase === 'finished' || it.phase === 'failed')
		.map((it) => it as Extract<ShellRecordingLogEntry, { phase: 'finished' | 'failed' }>)
		.sort((a, b) => a.recordIndex - b.recordIndex)
		.map((entry) => ({
			command: entry.command,
			stdout: entry.stdout,
			stderr: entry.stderr,
			exitCode: entry.exitCode,
		}));
}

export function toRecordingEntry(
	command: string,
	result: Pick<ShellOutputLike, 'stdout' | 'stderr' | 'exitCode'>,
): ShellRecordingEntry {
	return {
		command,
		stdout: result.stdout.toString(),
		stderr: result.stderr.toString(),
		exitCode: result.exitCode,
	};
}
