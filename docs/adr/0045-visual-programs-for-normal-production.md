# ADR 0045: Visual Programs for normal video production

- Status: Accepted
- Date: 2026-07-15

## Context and problem statement

The live novel-scene E2E reached CP4 but repeatedly failed while asking a model to author free-form TSX that also satisfied a restrictive static policy. The failures involved computed property access, style allowlists, formatting, source size, and AST size. A controlled source fixture can pass quarantine, but repeated whole-program generation cannot reliably converge, and passing syntactic policy cannot prove general JavaScript safe for production execution.

Claqueta still needs novel reusable temporal visuals without granting specialists filesystem, process, registry, promotion, or publication authority.

## Decision drivers

- Normal production must support bounded temporal and relational visual behavior.
- Model judgment should choose visual intent and data, not compile policy-conformant source.
- Parent authority, topic neutrality, exact lineage, restart safety, and independent Scene QA must remain intact.
- CP4 must not become executable-code authorization.
- Existing executable-candidate evidence and rollback state must remain recoverable.
- The next E2E must test useful visual innovation, not policy relaxation.

## Considered options

### Continue free-form TSX with prompt repair

Rejected. Repeated complete regeneration was costly and unstable, and no denylist can make arbitrary TypeScript/React a safe capability language.

### Patch rejected TSX through source-aware repair

Rejected for normal production. Patching may improve developer productivity but remains general executable code and does not create a sound security boundary.

### Compile a bounded IR into generated TSX

Not chosen for the initial architecture. Deterministic generation would remove model-source variance, but it would retain registry writes, multi-file promotion, bundle cost, and source rollback when direct interpretation is sufficient.

### Interpret a bounded Visual Program through trusted renderer code

Chosen. Models produce inert typed data. Repository-owned code validates, normalizes, hashes, renders, and verifies it.

## Decision outcome

Normal `new_video` must never generate, execute, promote, or write TSX.

`ComposedScene` remains the static semantic layout DSL. A sibling versioned Visual Program IR supports a closed family of bounded temporal and relational operations. One trusted, statically registered Remotion component interprets validated programs using frame-derived animation and target-owned semantic tokens.

A Visual Recipe is immutable reusable data over the IR with a closed binding schema. A direct one-video program needs no capability-adoption checkpoint. A reusable recipe gap requires CP4 for its generic capability contract and a separate exact adoption approval for the compiled recipe and evidence.

Visual Program v1 contains only bounded nodes, edges, panels, labels, normalized coordinates, semantic states, precomputed timestamped events, pulses, isolation, boundaries, and behavioral assertions. It contains no expressions, callbacks, imports, URLs, arbitrary styles, graph traversal, runtime simulation, or executable fields.

Adding an opcode, primitive family, renderer, target adapter, dependency, or executable component is conventional repository code evolution with ordinary review and release. A model may propose an inert specification and tests but cannot promote the implementation.

Current Tier 2 source-policy, quarantine, promotion, and rollback modules are frozen and isolated for legacy recovery and exceptional evidence. They are unreachable from normal coordination and are not deleted until all durable rows are terminal and evidence retention is resolved.

## Consequences

### Positive

- Policy-conformance failures disappear from ordinary scene generation.
- Production code remains static and reviewed.
- Identical program/version/target inputs produce canonical props and hashes.
- Behavioral evidence can target meaningful event boundaries instead of one representative still.
- Reusable capability adoption becomes a transactional data operation rather than a filesystem source transaction.
- Models retain creative judgment without execution authority.

### Negative

- Visual innovation is bounded by the current grammar.
- New primitive families require conventional engineering releases.
- The compiler and trusted renderer become security-sensitive code requiring adversarial tests.
- Existing Tier 2 modules remain temporarily as an isolated compatibility burden.

## Validation

- Coordinator tests prove no normal action reaches executable candidate generation or source promotion.
- Contract tests reject unknown fields, unsafe values, dangling references, excessive budgets, invalid timing, and unsupported operations.
- Determinism tests bind schema, compiler, renderer, target adapter, program, bindings, and assertions.
- Multi-frame fixtures prove propagation, bridge isolation, stopped propagation, and synchronized comparison.
- Repository integrity tests prove normal recipe adoption writes no production source.
