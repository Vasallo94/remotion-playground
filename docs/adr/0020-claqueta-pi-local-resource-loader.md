# 0020. Claqueta Pi uses a local-only curated resource loader

## Status

Accepted; legacy prompt-loading clause superseded by ADR 0022

## Context

The Pi SDK can discover skills, prompts, themes, extensions, and context files from global and project-wide locations. That default behavior is convenient for general agents, but `packages/agent-pi` is a specialized Claqueta runtime and should not inherit arbitrary resources installed in `~/.pi` or other project roots.

Claqueta already owns a curated set of skills and prompt templates under `packages/agent/skills` and `packages/agent/prompts`. The runtime only needs a small, deterministic subset for video generation.

## Decision Drivers

- Avoid contamination from unrelated global skills or prompts.
- Keep the runtime deterministic and reproducible inside the repo.
- Load only Claqueta-owned resources that are relevant to video generation.
- Surface missing expected resources through diagnostics instead of silent fallback.

## Considered Options

### Option 1 — Use `DefaultResourceLoader` with default discovery

- Pros: zero custom code.
- Cons: pulls in global/project resources indiscriminately, which can change behavior depending on the developer machine.

### Option 2 — Use `DefaultResourceLoader` with explicit local paths

- Pros: reuses the SDK loader while restricting discovery to repo-owned skills/prompts.
- Cons: still needs a small layer to curate paths and add diagnostics for missing optional resources.

### Option 3 — Hand-roll a fully custom loader

- Pros: maximum control.
- Cons: duplicates SDK behavior for loading skills/prompts and increases maintenance cost.

## Decision

Choose Option 2. `packages/agent-pi` now builds a curated local resource manifest and feeds it to `DefaultResourceLoader` with default discovery disabled (`noExtensions`, `noSkills`, `noPromptTemplates`, `noThemes`, `noContextFiles`). The loader only reads explicitly curated Claqueta-owned resources from this repository, and it reports missing expected resources as diagnostics. ADR 0022 later removed wholesale discovery of `packages/agent/prompts`: Pi specialist prompts are now curated and loaded explicitly by each runner.

## Consequences

- The agent runtime stays deterministic across machines.
- Global `~/.pi` resources no longer influence Claqueta behavior.
- Required skills (`scene-catalog`, `video-best-practices`, `scene-timing-guide`, `gemini-tts`, `sound-engineer`) and optional ones (`remotion-director`, `brand-guidelines`) are tracked explicitly.
- Legacy prompt templates are not exposed to Pi; specialist runners load topic-neutral role prompts explicitly (ADR 0022).
- Any future resource additions must be added to the curated manifest and covered by tests.
