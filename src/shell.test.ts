import { describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	createShell,
	RecordedShellError,
	ReplayExhaustedError,
	ReplayMismatchError,
} from './shell.js';

describe('createShell', () => {
	it('records two identical commands as distinct ordered entries', async () => {
		const recordShell = createShell({ mode: 'record' });

		const record = await Promise.all([
			recordShell`date +%s%N`.quiet().text(),
			recordShell`date +%s%N`.quiet().text(),
		]);

		const replayShell = createShell({ mode: 'replay', recording: recordShell.getRecording() });
		const replay = await Promise.all([
			replayShell`date +%s%N`.quiet().text(),
			replayShell`date +%s%N`.quiet().text(),
		]);

		expect(replay).toEqual(record);
	});

	it('replays two identical commands as distinct ordered entries from a recording on disk', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'shell-recording-'));
		const logPath = join(dir, 'recordings.ndjson');

		try {
			const recordShell = createShell({ mode: 'record', recordingLogPath: logPath });

			const record = await Promise.all([
				recordShell`date +%s%N`.quiet().text(),
				recordShell`date +%s%N`.quiet().text(),
			]);

			const replayShell = createShell({
				mode: 'replay',
				recordingLogPath: logPath,
			});
			const replay = await Promise.all([
				replayShell`date +%s%N`.quiet().text(),
				replayShell`date +%s%N`.quiet().text(),
			]);

			expect(replay).toEqual(record);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('replays entries strictly in sequence', async () => {
		const $ = createShell({
			mode: 'replay',
			recording: [
				{ command: 'echo first', stdout: 'one', stderr: '', exitCode: 0 },
				{ command: 'echo second', stdout: 'two', stderr: '', exitCode: 0 },
			],
		});

		expect((await $`echo first`).text()).toBe('one');
		expect((await $`echo second`).text()).toBe('two');
	});

	it('throws on replay command mismatch', async () => {
		const $ = createShell({
			mode: 'replay',
			recording: [{ command: 'echo expected', stdout: '', stderr: '', exitCode: 0 }],
		});

		await expectRejectsInstanceOf(Promise.resolve($`echo actual`), ReplayMismatchError);
	});

	it('throws when replay runs out of entries', async () => {
		const $ = createShell({
			mode: 'replay',
			recording: [{ command: 'echo once', stdout: '', stderr: '', exitCode: 0 }],
		});

		await $`echo once`;
		await expectRejectsInstanceOf(Promise.resolve($`echo twice`), ReplayExhaustedError);
	});

	it('returns recorded stdout from text in replay mode', async () => {
		const $ = createShell({
			mode: 'replay',
			recording: [{ command: 'echo hello', stdout: 'hello\n', stderr: '', exitCode: 0 }],
		});

		expect(await $`echo hello`.text()).toBe('hello\n');
	});

	it('exposes stdout, stderr and exitCode on awaited result', async () => {
		const $ = createShell({
			mode: 'replay',
			recording: [{ command: 'echo hello', stdout: 'out', stderr: 'err', exitCode: 7 }],
			throws: false,
		});

		const result = await $`echo hello`;

		expect(result.stdout.toString()).toBe('out');
		expect(result.stderr.toString()).toBe('err');
		expect(result.exitCode).toBe(7);
	});

	it('returns non-zero results with nothrow in replay mode', async () => {
		const $ = createShell({
			mode: 'replay',
			recording: [{ command: 'false', stdout: '', stderr: 'nope', exitCode: 1 }],
		});

		const result = await $`false`.nothrow();

		expect(result.exitCode).toBe(1);
		expect(result.stderr.toString()).toBe('nope');
	});

	it('throws RecordedShellError for non-zero replayed exits by default', async () => {
		const $ = createShell({
			mode: 'replay',
			recording: [{ command: 'false', stdout: 'out', stderr: 'err', exitCode: 9 }],
		});

		await expectRejectsInstanceOf(Promise.resolve($`false`), RecordedShellError);
	});

	it('passes cwd and env through chained configuration', async () => {
		const $ = createShell({ mode: 'record' });
		const result = await $`/bin/sh -c 'printf "%s|%s" "$PWD" "$HELLO"'`
			.cwd('/')
			.env({ HELLO: 'world' })
			.text();

		expect(result).toBe('/|world');
		expect($.getRecording()).toEqual([
			{
				command: `/bin/sh -c 'printf "%s|%s" "$PWD" "$HELLO"'`,
				stdout: '/|world',
				stderr: '',
				exitCode: 0,
			},
		]);
	});

	it('returns a defensive copy from getRecording', async () => {
		const $ = createShell({ mode: 'record' });

		await $`printf out`.quiet();
		const firstCopy = $.getRecording();
		const firstEntry = firstCopy[0];
		expect(firstEntry).toBeDefined();
		if (!firstEntry) {
			throw new Error('Expected the first recording entry to be present');
		}
		firstEntry.stdout = 'mutated';

		expect($.getRecording()).toEqual([
			{
				command: 'printf out',
				stdout: 'out',
				stderr: '',
				exitCode: 0,
			},
		]);
	});

	it('writes started and finished events to disk in record mode', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'shell-recording-'));
		const logPath = join(dir, 'recordings.ndjson');

		try {
			const $ = createShell({ mode: 'record', recordingLogPath: logPath });

			await $`printf out`.cwd('/').quiet();

			const events = readRecordingLog(logPath);
			expect(events).toHaveLength(2);
			expect(events[0]).toMatchObject({
				phase: 'started',
				command: 'printf out',
				cwd: '/',
			});
			expect(events[1]).toMatchObject({
				phase: 'finished',
				command: 'printf out',
				cwd: '/',
				exitCode: 0,
				stdout: 'out',
				stderr: '',
			});
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('records shell-like failures before rethrowing', async () => {
		const $ = createShell({ mode: 'record' });

		await expectRejectsInstanceOf(
			Promise.resolve($`/bin/sh -c 'printf out; printf err >&2; exit 3'`.quiet()),
			RecordedShellError,
		);
		expect($.getRecording()).toEqual([
			{
				command: `/bin/sh -c 'printf out; printf err >&2; exit 3'`,
				stdout: 'out',
				stderr: 'err',
				exitCode: 3,
			},
		]);
	});

	it('writes started and failed events to disk for shell failures', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'shell-recording-'));
		const logPath = join(dir, 'recordings.ndjson');

		try {
			const $ = createShell({ mode: 'record', recordingLogPath: logPath });

			await expectRejectsInstanceOf(
				Promise.resolve($`/bin/sh -c 'printf out; printf err >&2; exit 3'`.quiet()),
				RecordedShellError,
			);

			const events = readRecordingLog(logPath);
			expect(events).toHaveLength(2);
			expect(events[0]).toMatchObject({
				phase: 'started',
				command: `/bin/sh -c 'printf out; printf err >&2; exit 3'`,
			});
			expect(events[1]).toMatchObject({
				phase: 'failed',
				command: `/bin/sh -c 'printf out; printf err >&2; exit 3'`,
				exitCode: 3,
				stdout: 'out',
				stderr: 'err',
			});
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('rejects unsupported stream-like interpolations', async () => {
		const $ = createShell({ mode: 'replay', recording: [] });
		const stream = new ReadableStream();

		await expectRejectsWithMessage(
			Promise.resolve($`cat ${stream}`),
			'Unsupported shell interpolation',
		);
	});

	it('does not write disk logs outside record mode', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'shell-recording-'));
		const logPath = join(dir, 'recordings.ndjson');

		try {
			const replayShell = createShell({
				mode: 'replay',
				recording: [{ command: 'echo hello', stdout: 'hello\n', stderr: '', exitCode: 0 }],
			});

			await replayShell`echo hello`.text();

			expect(() => readFileSync(logPath, 'utf8')).toThrow();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

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

function readRecordingLog(logPath: string): Array<ShellRecordingLogEntry> {
	return readFileSync(logPath, 'utf8')
		.trim()
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line) as ShellRecordingLogEntry);
}

async function expectRejectsInstanceOf(
	promise: Promise<unknown>,
	expected: { name: string; prototype: Error },
): Promise<void> {
	try {
		await promise;
	} catch (error) {
		expect(error).toBeInstanceOf(expected);
		return;
	}

	throw new Error(`Expected promise to reject with ${expected.name}`);
}

async function expectRejectsWithMessage(promise: Promise<unknown>, message: string): Promise<void> {
	try {
		await promise;
	} catch (error) {
		expect(error).toBeInstanceOf(Error);
		if (!(error instanceof Error)) {
			throw new Error('Expected rejection to be an Error');
		}
		expect(error.message).toContain(message);
		return;
	}

	throw new Error(`Expected promise to reject with message containing "${message}"`);
}
