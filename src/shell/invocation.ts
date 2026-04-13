import type { InvocationDriver, ShellInvocation } from './types.js';

export function createInvocation(driver: InvocationDriver): ShellInvocation {
	const invocation: ShellInvocation = {
		cwd(newCwd: string) {
			driver.cwd?.(newCwd);
			return invocation;
		},
		env(newEnv: Record<string, string | undefined> | undefined) {
			driver.env?.(newEnv);
			return invocation;
		},
		quiet(isQuiet: boolean = true) {
			driver.quiet?.(isQuiet);
			return invocation;
		},
		nothrow() {
			driver.throws(false);
			return invocation;
		},
		throws(shouldThrow: boolean) {
			driver.throws(shouldThrow);
			return invocation;
		},
		text(encoding: BufferEncoding = 'utf8') {
			invocation.quiet();
			return driver.run().then((output) => output.text(encoding));
		},
		json() {
			invocation.quiet();
			return driver.run().then((output) => output.json());
		},
		arrayBuffer() {
			invocation.quiet();
			return driver.run().then((output) => output.arrayBuffer());
		},
		bytes() {
			invocation.quiet();
			return driver.run().then((output) => output.bytes());
		},
		blob() {
			invocation.quiet();
			return driver.run().then((output) => output.blob());
		},
		// biome-ignore lint/suspicious/noThenProperty: PromiseLike requires a then method.
		then(onfulfilled, onrejected) {
			return driver.run().then(onfulfilled, onrejected);
		},
		catch(onrejected) {
			return driver.run().catch(onrejected);
		},
		finally(onfinally) {
			return driver.run().finally(onfinally ?? undefined);
		},
	};

	return invocation;
}
