# Agent Guidance

Prefer the simplest code that correctly captures the real behavior. Optimize for readability first: clear intent, minimal moving parts, and as little scaffolding as possible.

Prefer duplication over low-value abstraction. Prefer AHA and WET over blind DRY: avoid hasty abstractions, accept some repetition, and apply DRY narrowly to duplicated knowledge rather than similar-looking code.

Do not introduce wrappers, helpers, aliases, indirection, or extra structure unless they materially improve correctness or clarity. Do not wrap built-ins or standard-library APIs just to rename them. Do not create one-off or two-off helpers unless they remove real complexity.

Prefer expressing API and configuration invariants in the type system rather than runtime checks whenever TypeScript can enforce them.

Mirror real usage patterns in both implementation and tests. Do not simplify away concurrency, ordering, or other important execution characteristics just to make code or tests easier to write.

When writing tests, assert the core behavioral contract with the fewest high-signal expectations needed. Favor meaningful outcome checks over noisy inspection of intermediate details.

Before declaring work complete, perform a self-review pass as if reviewing a junior engineer's PR. Assume the first working version is not good enough, and fix anything you would request changes on before presenting the work as done.
