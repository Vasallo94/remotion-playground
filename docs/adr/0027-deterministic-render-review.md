# 0027. Review final renders deterministically before human acceptance

## Status

Accepted

## Context

After rendering, Claqueta must verify that the MP4 exists and structurally matches the approved configuration. File size, duration, streams, dimensions, frame rate, codec, and audio presence are measurable facts; delegating them to an LLM adds no judgment value. The legacy reviewer is an LLM wrapper around `ffprobe` and accepts arbitrary filesystem paths, while the Pi runtime may run outside the render-service container and cannot safely trust stored host paths.

A final human still needs to accept the playable result. Structural validation must therefore produce a persistent report and checkpoint without conflating technical checks with aesthetic approval.

## Decision Drivers

- Keep deterministic checks out of LLM sessions.
- Avoid arbitrary path probing and host/container path mismatches.
- Review only known completed render jobs.
- Preserve exact actual and expected metadata.
- Distinguish blocking failures from warnings.
- Keep final acceptance and revision authority with the human/parent.

## Considered Options

### Option 1 — Port the legacy reviewer LLM

- Pros: mirrors the old graph.
- Cons: unnecessary model call, arbitrary path input, and no stronger technical verification.

### Option 2 — Probe the stored output path in agent-pi

- Pros: simple tool implementation.
- Cons: breaks across container boundaries and trusts a path from another service.

### Option 3 — Probe a known job inside render-service and persist the report in Pi

- Pros: path confinement, no container mismatch, fixed process invocation, deterministic report, and clean checkpoint ownership.
- Cons: adds one render-service endpoint.

## Decision

Choose Option 3.

`GET /api/render/:id/review` resolves only that job's staged `config.json` and `output.mp4` beneath the render jobs directory, requires job status `done`, and invokes `ffprobe` through `execFile` without a shell. It reports file size, duration/delta/tolerance, video/audio streams, dimensions, frame rate, codec, expected audio, blocking failures, warnings, and an overall pass flag.

The Pi parent requests the report for its latest completed render-job artifact, persists `render-review.json`, updates the `review` step, and always presents final human acceptance. Approval completes the pipeline decision; rejection starts a separate revision or recovery flow and does not mutate the approved config automatically.

## Consequences

- No reviewer LLM is needed for technical metadata.
- Review works when agent-pi and render-service have different filesystem views.
- A structurally valid MP4 can still be rejected aesthetically by the human.
- Deeper temporal or perceptual review remains a future extension and must not be inferred from metadata alone.
