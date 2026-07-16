# 0030. Use reviewable integrity manifests and registered test cleanup roots

## Status

Accepted

## Context

An unexplained workspace-deletion incident makes it unsafe to assume that a test cleanup path remains correct after path construction, symlink resolution, or future refactoring. Existing tests recursively deleted paths assembled from temporary directories and one generated project fixture without a shared ownership check. The workspace also lacked a lightweight, non-destructive baseline that could distinguish intended source changes from accidental loss.

## Decision Drivers

- Preserve dirty work and make unrelated drift visible before recovery-sensitive work.
- Prevent recursive test cleanup from accepting traversal, project-root, symlink, or arbitrary temporary paths.
- Avoid package installs, Git mutations, watchers, and generated-video inspection in integrity checks.
- Keep the baseline portable, reviewable, and useful from a clean or dirty worktree.

## Considered Options

### Option 1 — Trust each test's local `mkdtempSync` and cleanup call

- Pros: no shared helper.
- Cons: deletion authority remains implicit; a changed variable can target an unrelated path.

### Option 2 — Allow any directory below the operating-system temporary directory

- Pros: simple cleanup API.
- Cons: permits deleting pre-existing or unrelated temporary paths and does not prove process ownership.

### Option 3 — Register created temporary directories and compare an explicit manifest

- Pros: cleanup requires a fresh process-owned directory with an expected prefix; one exact generated fixture is explicit; hashes and Git status provide an auditable baseline.
- Cons: test prefixes and fixture paths must be registered deliberately.

## Decision

Choose Option 3.

`pnpm integrity:manifest` writes a JSON manifest containing Git short status and SHA-256 hashes for source, specification, and configuration files. Dependency trees and generated outputs are excluded. Compare mode reports added, changed, and removed files plus Git-status drift, then exits non-zero so callers stop for review.

The `agent-pi` test cleanup helper registers directories created by `mkdtempSync` only when their prefix is in a fixed allowlist and their real path is beneath the OS temporary directory. Recursive cleanup accepts only those registered roots or the exact generated fixture path. It rejects symbolic links and non-directory paths before deletion.

## Consequences

- Tests cannot recursively delete arbitrary project or temporary directories through their shared cleanup path.
- New test cleanup prefixes require an intentional code review change.
- Integrity comparisons flag expected implementation changes as well as accidental changes; humans must review the diff before replacing a baseline.
- Runtime cache cleanup and non-`agent-pi` package tests remain separately audited and are not broadened by this Phase 0 change.
