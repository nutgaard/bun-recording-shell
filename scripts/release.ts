import { readFileSync } from 'node:fs';

type PackageJson = {
	name: string;
	version: string;
};

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as PackageJson;
const packageSpec = `${packageJson.name}@${packageJson.version}`;

const existingVersion = Bun.spawnSync({
	cmd: ['npm', 'view', packageSpec, 'version', '--json'],
	stdout: 'pipe',
	stderr: 'pipe',
});

if (existingVersion.exitCode === 0) {
	console.log(`Skipping publish because ${packageSpec} is already on npm.`);
	process.exit(0);
}

const stderr = Buffer.from(existingVersion.stderr).toString('utf8');
if (!stderr.includes('E404') && !stderr.includes('404 Not Found')) {
	process.stderr.write(existingVersion.stderr);
	process.exit(existingVersion.exitCode);
}

const publish = Bun.spawnSync({
	cmd: ['npm', 'publish', '--provenance', '--access', 'public'],
	stdio: ['inherit', 'inherit', 'inherit'],
});

process.exit(publish.exitCode);
