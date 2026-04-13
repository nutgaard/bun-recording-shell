import { defineConfig } from 'bunup';

export default defineConfig({
	entry: ['src/shell.ts'],
	format: ['esm'],
	dts: true,
	clean: true,
	external: ['bun'],
});
