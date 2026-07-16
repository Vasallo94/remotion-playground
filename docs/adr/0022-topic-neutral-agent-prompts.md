# 0022. Claqueta agent roles are topic-neutral

## Status

Accepted

## Context

Claqueta must generate videos about arbitrary subjects. Some legacy DeepAgents prompts mixed stable role responsibilities with topic-specific assumptions: Línea Directa product rules, Claude Code examples, tutorial defaults, and fixed narrative recipes. The first Pi director draft repeated the same mistake by describing itself as a director for `ClaudeCodeTutorial`, even though that string is a technical composition identifier rather than a subject-matter constraint.

Copying those prompts into Pi would make specialists appear reusable while silently biasing their decisions toward technology, a specific brand, or a particular video genre.

## Decision Drivers

- A specialist's role should remain stable across subjects.
- Topic, brand, language, audience, platform, tone, and format must be explicit input data.
- Creative decisions must be justified by narrative purpose and available contracts, not keyword-to-template recipes.
- Brand- or domain-specific knowledge should remain optional context selected only when the request requires it.
- Technical composition identifiers must not leak into editorial assumptions.
- Migrated prompts need a consistent policy that can be tested.

## Considered Options

### Option 1 — Port legacy prompts verbatim

- Pros: fastest migration and preserves historical behavior.
- Cons: preserves brand/topic coupling, obsolete tool references, and contradictory defaults.

### Option 2 — Maintain separate agents per topic

- Pros: each prompt can be highly specialized.
- Cons: combinatorial growth, duplicated role logic, inconsistent quality, and brittle routing.

### Option 3 — Topic-neutral roles with conditional domain resources

- Pros: stable responsibilities, broad reuse, explicit routing, and domain knowledge only when relevant.
- Cons: requires prompt curation and richer briefs instead of relying on implicit assumptions.

## Decision

Choose Option 3.

Every Pi coordinator and specialist prompt must separate:

1. **Role contract** — what the agent is responsible for and what it may change.
2. **Input context** — subject, goal, audience, format, language, brand, evidence, assets, and constraints.
3. **Domain overlays** — optional skills or references selected because the input requires them.
4. **Output contract** — the structured artifact or decision the role must produce.

Prompts must not encode recipes such as “technical topic means terminal”, “science means timeline”, “product means pricing”, or “short means fast cuts”. Examples may illustrate schemas, but they must not become default editorial choices.

`ClaudeCodeTutorial` and `ProductShort` remain technical composition identifiers until the composition architecture is renamed or generalized. Agents must never infer subject matter from those names.

Legacy `packages/agent/prompts` will not be loaded wholesale into `agent-pi`. Pi specialists receive curated prompts under `packages/agent-pi/resources/agents`, reviewed under this policy. Topic- or brand-specific skills may remain discoverable, but the coordinator may use them only when the request explicitly matches their scope.

## Consequences

- The director, researcher, copywriter, audio planner, QA, reviewer, validator, and future scene creator can work across arbitrary subjects.
- Migrating a specialist requires rewriting its prompt contract, not copying the Python-era prompt verbatim.
- The brief and pipeline artifacts must carry enough context for agents to avoid implicit defaults.
- Resource-loader tests must ensure the Pi runtime does not expose the full legacy prompt directory.
- E2E coverage should include materially different topics and verify that scene choices are justified rather than keyword-triggered.
