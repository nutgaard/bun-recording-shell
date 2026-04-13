import type { JsonValue, ShellOutputLike, ShellResult } from './types.js';

function parseJsonValue(text: string): JsonValue {
	return JSON.parse(text) as JsonValue;
}

export class ShellOutput implements ShellOutputLike {
	readonly stdout: Buffer;
	readonly stderr: Buffer;
	readonly exitCode: number;

	constructor(stdout: unknown, stderr: unknown, exitCode: number) {
		this.stdout = toBuffer(stdout);
		this.stderr = toBuffer(stderr);
		this.exitCode = exitCode;
	}

	text(encoding: BufferEncoding = 'utf8'): string {
		return this.stdout.toString(encoding);
	}

	json(): JsonValue {
		return parseJsonValue(this.text());
	}

	arrayBuffer(): ArrayBuffer {
		return this.bytes().buffer.slice(0);
	}

	bytes(): Uint8Array<ArrayBuffer> {
		return Uint8Array.from(this.stdout);
	}

	blob(): Blob {
		return new Blob([this.bytes()]);
	}
}

export class RecordedShellError extends Error implements ShellOutputLike {
	readonly stdout: Buffer;
	readonly stderr: Buffer;
	readonly exitCode: number;
	readonly command: string;

	constructor(command: string, stdout: unknown, stderr: unknown, exitCode: number) {
		super(`Command failed with exit code ${String(exitCode)}: ${command}`);
		this.name = 'RecordedShellError';
		this.command = command;
		this.stdout = toBuffer(stdout);
		this.stderr = toBuffer(stderr);
		this.exitCode = exitCode;
	}

	text(encoding: BufferEncoding = 'utf8'): string {
		return this.stdout.toString(encoding);
	}

	json(): JsonValue {
		return parseJsonValue(this.text());
	}

	arrayBuffer(): ArrayBuffer {
		return this.bytes().buffer.slice(0);
	}

	bytes(): Uint8Array<ArrayBuffer> {
		return Uint8Array.from(this.stdout);
	}

	blob(): Blob {
		return new Blob([this.bytes()]);
	}
}

export class ReplayMismatchError extends Error {
	constructor(index: number, expectedCommand: string, actualCommand: string) {
		super(
			`Replay mismatch at entry ${String(index)}: expected "${expectedCommand}" but got "${actualCommand}"`,
		);
		this.name = 'ReplayMismatchError';
	}
}

export class ReplayExhaustedError extends Error {
	constructor(index: number, actualCommand: string) {
		super(`Replay exhausted at entry ${String(index)} for command "${actualCommand}"`);
		this.name = 'ReplayExhaustedError';
	}
}

export function toRecordedShellError(
	command: string,
	error: unknown,
): RecordedShellError | undefined {
	if (!isShellResult(error)) {
		return undefined;
	}

	return new RecordedShellError(command, error.stdout, error.stderr, Number(error.exitCode));
}

function isShellResult(value: unknown): value is ShellResult {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const candidate = value as {
		stdout?: unknown;
		stderr?: unknown;
		exitCode?: unknown;
	};
	return 'stdout' in candidate && 'stderr' in candidate && typeof candidate.exitCode === 'number';
}

function toBuffer(value: unknown): Buffer {
	if (Buffer.isBuffer(value)) {
		return value;
	}
	if (value instanceof Uint8Array) {
		return Buffer.from(value);
	}
	if (value instanceof ArrayBuffer) {
		return Buffer.from(value);
	}
	if (typeof value === 'string') {
		return Buffer.from(value, 'utf8');
	}
	if (
		typeof value === 'number' ||
		typeof value === 'boolean' ||
		typeof value === 'bigint' ||
		typeof value === 'symbol'
	) {
		return Buffer.from(String(value), 'utf8');
	}
	if (value === null || value === undefined) {
		return Buffer.alloc(0);
	}
	if (typeof value === 'object') {
		return Buffer.from(JSON.stringify(value), 'utf8');
	}
	return Buffer.from(Function.prototype.toString.call(value), 'utf8');
}
