# @nutgaard/bun-recording-shell

Record and replay Bun shell invocations for deterministic tests.

This package wraps Bun's `$` shell API and gives you three modes:

- `passthrough`: run commands normally
- `record`: run commands and capture their outputs
- `replay`: return previously recorded outputs without re-running commands

It is useful when you want to test code that shells out, but you do not want your test suite to depend on the real system state, network, filesystem tools, or command timing.

## Requirements

- Bun runtime
- Node compatibility is for package consumers, but the runtime behavior depends on `bun`

## Install

```bash
bun add @nutgaard/bun-recording-shell
```

## Basic usage

```ts
import { createShell } from '@nutgaard/bun-recording-shell';

const $ = createShell({ mode: 'passthrough' });

const result = await $`printf hello`;

console.log(result.text()); // hello
```

## Record and replay

```ts
import { createShell } from '@nutgaard/bun-recording-shell';

const recordShell = createShell({ mode: 'record' });

await recordShell`printf first`.quiet();
await recordShell`printf second`.quiet();

const replayShell = createShell({
	mode: 'replay',
	recording: recordShell.getRecording(),
});

console.log((await replayShell`printf first`).text()); // first
console.log((await replayShell`printf second`).text()); // second
```

## Persist recordings to disk

In record mode, you can write command events to an NDJSON log file and later replay from that file.

```ts
import { createShell } from '@nutgaard/bun-recording-shell';

const recordShell = createShell({
	mode: 'record',
	recordingLogPath: './fixtures/commands.ndjson',
});

await recordShell`printf hello`.quiet();

const replayShell = createShell({
	mode: 'replay',
	recordingLogPath: './fixtures/commands.ndjson',
});

console.log((await replayShell`printf hello`).text()); // hello
```

If you only need the finished command entries, you can also parse the file directly:

```ts
import { readReplayRecording } from '@nutgaard/bun-recording-shell';

const recording = readReplayRecording('./fixtures/commands.ndjson');
```

## Command behavior

Replay mode is strict by design:

- commands must be replayed in the same order they were recorded
- the rendered command string must match exactly
- non-zero exits throw by default, just like live shell execution

If you want to inspect a non-zero result without throwing, use `.nothrow()`:

```ts
const result = await replayShell`false`.nothrow();
console.log(result.exitCode);
```

## Errors

The package exports specific error types for replay and recorded failures:

- `RecordedShellError`: command failed with a non-zero exit code
- `ReplayMismatchError`: replayed command did not match the next recorded command
- `ReplayExhaustedError`: replay ran out of recorded entries

`RecordedShellError` also exposes:

- `command`
- `stdout`
- `stderr`
- `exitCode`

## API

### `createShell(options)`

Creates a Bun shell wrapper.

Modes:

- `{ mode: 'passthrough' }`
- `{ mode: 'record', recordingLogPath?: string }`
- `{ mode: 'replay', recording: ShellRecordingEntry[] }`
- `{ mode: 'replay', recordingLogPath: string }`

Shared options:

- `cwd`
- `env`
- `throws`

### `ShellRecordingEntry`

```ts
type ShellRecordingEntry = {
	command: string;
	stdout: string;
	stderr: string;
	exitCode: number;
};
```

### `readReplayRecording(logPath)`

Reads a recording log file and returns the finished command entries as `ShellRecordingEntry[]`.

## Notes

- This package is Bun-specific because it builds on Bun's shell API.
- Unsupported stream-like interpolations are rejected in replay mode.
- Published output is ESM-only.
