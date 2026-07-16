# 0028. Create scenes declaratively first and quarantine code escalation

## Status

Accepted

## Context

Custom scene creation is Claqueta's highest-risk capability. A generated React component executes during bundling and inside Remotion's browser, can import arbitrary packages, can mutate repository architecture through registry edits, and can silently encode topic-specific copy, colors, assets, or animation behavior. The legacy creator gives an LLM direct write access to production `.tsx`, then mutates the registry before bundle validation. Its retry graph also cannot reliably regenerate code from validation feedback and may leave partial repository mutations.

At the same time, forbidding new visuals would constrain Claqueta to a static catalog. Most “new scene” requests are actually new compositions of stable primitives—text, cards, metrics, lists, rows, grids, progress, dividers, and semantic emphasis—not genuinely new executable capabilities.

## Decision Drivers

- Treat generated executable code as exceptional and hostile until proven otherwise.
- Make the common path data-only, topic-neutral, deterministic, and cheap to validate.
- Preserve Remotion frame determinism and theme abstraction.
- Prevent specialists from writing production files or editing registries.
- Make reusable capability growth explicit rather than generating one-off topical components.
- Keep human approval before expanding executable capability.
- Provide reproducible validation, visual evidence, atomic promotion, and rollback.

## Considered Options

### Option 1 — Give an isolated Pi coding agent scoped filesystem and shell tools

- Pros: flexible and close to normal coding workflows.
- Cons: filesystem scope does not prevent malicious imports/runtime behavior; shell and package execution enlarge the attack surface; partial mutations remain possible.

### Option 2 — Generate React source through one terminating tool and apply it directly after lint

- Pros: narrower than filesystem tools.
- Cons: lint/typecheck do not prove runtime safety, reusability, visual quality, or absence of hidden side effects.

### Option 3 — Declarative scene DSL for the common path, quarantined source artifacts for exceptional capability gaps

- Pros: data-only default, one shared contract, bounded complexity, deterministic renderer, explicit reusable gaps, no direct writes, layered static/build/visual verification, and human-controlled promotion.
- Cons: requires a primitive runtime and cannot immediately express every visual; code escalation is deliberately slower.

## Decision

Choose Option 3.

### Tier 1 — `composed-scene`

A workspace contract package is the single source of truth for a versioned declarative scene tree. It provides semantic primitives and pure validation with strict unknown-field rejection and limits on depth, nodes, children, text, numeric ranges, and animation timing. It contains no React or runtime-specific code.

Remotion statically registers one `composed-scene` renderer. The renderer maps semantic tones to theme tokens and all motion to `useCurrentFrame()` plus Remotion interpolation/spring. The isolated Pi composer can submit only contract-valid JSON or a structured capability gap. It has no code/filesystem/shell tools.

### Tier 2 — reusable capability escalation

A gap is not permission to emit code. The parent first presents CP4 with reuse analysis, a generic proposed prop contract, security implications, affected files, and acceptance tests. Only after approval does a fresh coding session receive curated read-only references and one terminating candidate-source tool.

Candidate source is persisted under `.generated/`, never production paths. Parent policy parses/inspects it and rejects non-allowlisted imports and dangerous or nondeterministic constructs. Verification occurs in a disposable quarantine with format, TypeScript, ESLint, bundle, and representative still checks. A second CP4 promotion view presents source diff and stills.

Only the parent can atomically promote approved source and deterministic registry/timing/catalog changes. Full gates run after promotion; failure rolls back only the promoted files. Every proposal, validation result, decision, and promoted path remains an artifact.

## Consequences

- Most visual novelty becomes safe data composition rather than repository mutation.
- The scene composer remains topic-neutral and cannot execute generated code.
- Truly reusable capabilities can still expand Claqueta, but require explicit human and verifier evidence.
- Existing hand-written custom scenes remain supported and can gradually become DSL primitives or references.
- The first implementation slice must establish the shared contract and renderer before enabling code escalation.
