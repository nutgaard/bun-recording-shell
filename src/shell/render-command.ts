import { $ as bunDollar } from 'bun';
import type { ShellExpression } from './types.js';

export function renderCommand(
	strings: TemplateStringsArray,
	expressions: Array<ShellExpression>,
	rejectUnsupported: boolean,
): string {
	let command = '';

	for (let index = 0; index < strings.length; index += 1) {
		command += strings[index] ?? '';
		if (index < expressions.length) {
			const expression = expressions[index];
			if (expression !== undefined) {
				command += renderExpression(expression, rejectUnsupported);
			}
		}
	}

	return command;
}

function renderExpression(expression: ShellExpression, rejectUnsupported: boolean): string {
	if (Array.isArray(expression)) {
		const renderedItems: Array<string> = [];
		for (const item of expression as Array<ShellExpression>) {
			renderedItems.push(renderExpression(item, rejectUnsupported));
		}
		return renderedItems.join(' ');
	}

	if (isUnsupportedShellExpression(expression)) {
		if (rejectUnsupported) {
			throw new Error(
				`Unsupported shell interpolation in recording wrapper: ${describeExpression(expression)}`,
			);
		}
		return `[unsupported:${describeExpression(expression)}]`;
	}

	if (typeof expression === 'string') {
		return bunDollar.escape(expression);
	}
	if (
		typeof expression === 'number' ||
		typeof expression === 'boolean' ||
		typeof expression === 'bigint'
	) {
		return bunDollar.escape(String(expression));
	}
	if (
		expression &&
		typeof expression === 'object' &&
		'raw' in expression &&
		typeof expression.raw === 'string'
	) {
		return expression.raw;
	}
	if (
		expression !== null &&
		expression !== undefined &&
		typeof expression === 'object' &&
		typeof expression.toString === 'function' &&
		expression.toString !== Object.prototype.toString
	) {
		return bunDollar.escape(renderCustomString(expression));
	}

	throw new Error(
		`Unsupported shell interpolation in recording wrapper: ${describeExpression(expression)}`,
	);
}

function isUnsupportedShellExpression(expression: ShellExpression): boolean {
	if (expression === null || expression === undefined || Array.isArray(expression)) {
		return false;
	}

	if (typeof ReadableStream !== 'undefined' && expression instanceof ReadableStream) {
		return true;
	}
	if (typeof WritableStream !== 'undefined' && expression instanceof WritableStream) {
		return true;
	}
	if (typeof expression === 'object') {
		const candidate = expression as {
			stdin?: unknown;
			stdout?: unknown;
			stderr?: unknown;
			pipeTo?: unknown;
			getReader?: unknown;
		};
		return (
			'stdin' in candidate ||
			'stdout' in candidate ||
			'stderr' in candidate ||
			typeof candidate.pipeTo === 'function' ||
			typeof candidate.getReader === 'function'
		);
	}

	return false;
}

function renderCustomString(expression: { toString(): string }): string {
	return expression.toString();
}

function describeExpression(expression: ShellExpression): string {
	if (expression === null) return 'null';
	if (expression === undefined) return 'undefined';
	if (Array.isArray(expression)) return 'array';
	if (typeof expression === 'object') return expression.constructor.name || 'object';
	return typeof expression;
}
