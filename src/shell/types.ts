import type { $ as bunDollar } from 'bun';

export type ShellRecordingEntry = {
	command: string;
	stdout: string;
	stderr: string;
	exitCode: number;
};

export type BaseShellOptions = {
	cwd?: string;
	env?: Record<string, string | undefined>;
	throws?: boolean;
};

export type CreateShellOptions = BaseShellOptions &
	(
		| { mode: 'passthrough' }
		| { mode: 'record'; recordingLogPath?: string }
		| ({ mode: 'replay' } & (
				| { recording: Array<ShellRecordingEntry> }
				| { recordingLogPath: string }
		  ))
	);

export type ShellExpression = Parameters<typeof bunDollar>[1];
export type BunShell = ReturnType<typeof bunDollar>;
export type ShellResult = {
	stdout: unknown;
	stderr: unknown;
	exitCode: unknown;
};

export type RecordingState = {
	entries: Array<ShellRecordingEntry | null>;
	pending: number;
	logPath: string | undefined;
};

export type ReplayState = {
	throws: boolean;
};

export type InvocationDriver = {
	run(): Promise<ShellOutputLike>;
	cwd?(newCwd: string): void;
	env?(newEnv: Record<string, string | undefined> | undefined): void;
	quiet?(isQuiet: boolean): void;
	throws(shouldThrow: boolean): void;
};

export type JsonValue =
	| null
	| boolean
	| number
	| string
	| Array<JsonValue>
	| { [key: string]: JsonValue };

export type Shell = (
	strings: TemplateStringsArray,
	...expressions: Array<ShellExpression>
) => ShellInvocation;

export type RecordingShell = Shell & {
	getRecording(): Array<ShellRecordingEntry>;
};

export type CreateShellResult<TOptions extends CreateShellOptions> = TOptions extends {
	mode: 'record';
}
	? RecordingShell
	: Shell;

export interface ShellOutputLike {
	readonly stdout: Buffer;
	readonly stderr: Buffer;
	readonly exitCode: number;
	text(encoding?: BufferEncoding): string;
	json(): JsonValue;
	arrayBuffer(): ArrayBuffer;
	bytes(): Uint8Array<ArrayBuffer>;
	blob(): Blob;
}

export interface ShellInvocation extends PromiseLike<ShellOutputLike> {
	cwd(newCwd: string): this;
	env(newEnv: Record<string, string | undefined> | undefined): this;
	quiet(isQuiet?: boolean): this;
	nothrow(): this;
	throws(shouldThrow: boolean): this;
	text(encoding?: BufferEncoding): Promise<string>;
	json(): Promise<JsonValue>;
	arrayBuffer(): Promise<ArrayBuffer>;
	bytes(): Promise<Uint8Array<ArrayBuffer>>;
	blob(): Promise<Blob>;
	catch<TResult = never>(
		onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
	): Promise<ShellOutputLike | TResult>;
	finally(onfinally?: (() => void) | null): Promise<ShellOutputLike>;
}
