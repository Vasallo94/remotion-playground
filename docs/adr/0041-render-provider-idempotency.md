# 0041. Require render-service idempotency before restart resume

## Status

Accepted

## Context and problem statement

A parent action claim prevents concurrent submissions but cannot atomically commit with a remote render-service job. A crash after `POST /api/render` and before journal completion could submit the same expensive render twice.

## Decision

The render service accepts a parent `Idempotency-Key` and canonical request SHA-256. Jobs persist both fields behind a unique partial index.

- First request creates one job.
- Repeated key with the same request hash returns the existing job without spawning validation/render.
- Repeated key with another hash returns HTTP 409.
- The parent uses the canonical coordinator action key as provider key and hashes the exact submitted config/thread/audio-skip payload.
- `ParentActionExecutor.resumeInProgress` is opt-in and may be used only where the provider guarantees exact-key reuse. It resumes the same durable attempt generation, resubmits the same request, polls the reused job, and atomically commits completed render evidence.

## Consequences

- Render submission survives the SQLite/HTTP crash window without duplicate render work.
- Changed input cannot hide behind a stale provider key.
- Legacy callers without an idempotency key remain compatible but receive no restart guarantee.
- Render completion is represented by one approved `render_job` artifact and a completed render step.
