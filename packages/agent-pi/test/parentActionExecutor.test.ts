import { strict as assert } from "node:assert"
import { join } from "node:path"
import { test } from "node:test"
import { actionIdempotencyKey, evaluateDirectAction } from "../src/coordinator.js"
import { createActionKey, createInputSnapshotFingerprint, toJournalBeginInput } from "../src/actionJournal.js"
import { ParentActionExecutor } from "../src/parentActionExecutor.js"
import { AgentPiStore } from "../src/store.js"
import { createTestTemporaryDirectory, cleanupTestDirectory } from "../src/testCleanup.js"
import { buildInitialSnapshot } from "./recoveryFixtures.js"

function adapter(store: AgentPiStore) {
  return {
    evaluate: evaluateDirectAction,
    get: (threadId: string, actionKey: string) => store.readActionAttempt(threadId, createActionKey(actionKey)),
    begin: (input: Parameters<typeof toJournalBeginInput>[0], options?: { retryFailed?: boolean }) =>
      store.beginActionAttempt(toJournalBeginInput(input), options),
    succeed: store.succeedActionAttempt.bind(store),
    succeedWithArtifacts: store.succeedActionAttemptWithArtifacts.bind(store),
    fail: store.failActionAttempt.bind(store),
  }
}

test("claims before effects and remains exactly-once after restart", async () => {
  const root = createTestTemporaryDirectory("agent-pi-action-executor-")
  const databasePath = join(root, "executor.db")
  const snapshot = buildInitialSnapshot("executor-thread")
  const request = {
    action: "run_copywriter" as const,
    idempotencyKey: actionIdempotencyKey(snapshot, "run_copywriter"),
  }
  let effects = 0
  let store = new AgentPiStore(databasePath)
  store.createThread({ id: snapshot.plan!.threadId })
  try {
    const first = await new ParentActionExecutor(adapter(store)).execute({
      snapshot,
      request,
      effect: async () => {
        effects += 1
        return { outcome: { artifactId: "script-1" }, effectMetadata: { provider: "isolated-specialist" } }
      },
    })
    assert.equal(first.status, "succeeded")
    assert.equal(effects, 1)
    store.close()

    store = new AgentPiStore(databasePath)
    const duplicate = await new ParentActionExecutor(adapter(store)).execute({
      snapshot,
      request,
      effect: async () => {
        effects += 1
        return {}
      },
    })
    assert.equal(duplicate.status, "idempotent")
    assert.equal(effects, 1)
  } finally {
    store.close()
    cleanupTestDirectory(root)
  }
})

test("commits internal artifacts and action success in one SQLite transaction", async () => {
  const root = createTestTemporaryDirectory("agent-pi-action-executor-")
  const store = new AgentPiStore(join(root, "executor.db"))
  const snapshot = buildInitialSnapshot("executor-artifact-thread")
  const request = {
    action: "run_copywriter" as const,
    idempotencyKey: actionIdempotencyKey(snapshot, "run_copywriter"),
  }
  store.createThread({ id: snapshot.plan!.threadId })
  const revisionBefore = store.getThread(snapshot.plan!.threadId)?.revision ?? -1
  try {
    const result = await new ParentActionExecutor(adapter(store)).execute({
      snapshot,
      request,
      effect: async () => ({
        outcome: { generated: true },
        artifacts: [
          {
            threadId: snapshot.plan!.threadId,
            kind: "script",
            data: { title: "Atomic script", objective: "Prove atomic commit", scenes: [] },
          },
        ],
      }),
    })
    assert.equal(result.status, "succeeded")
    if (result.status !== "succeeded") return
    assert.equal(result.committedArtifacts.length, 1)
    assert.equal(store.listArtifacts(snapshot.plan!.threadId).length, 1)
    assert.equal(store.listActionAttempts(snapshot.plan!.threadId)[0]?.status, "succeeded")
    assert.equal(store.getThread(snapshot.plan!.threadId)?.revision, revisionBefore + 2)
  } finally {
    store.close()
    cleanupTestDirectory(root)
  }
})

test("rolls back artifact insertion when action completion is stale", () => {
  const root = createTestTemporaryDirectory("agent-pi-action-executor-")
  const store = new AgentPiStore(join(root, "executor.db"))
  store.createThread({ id: "stale-artifact-thread" })
  try {
    assert.throws(
      () =>
        store.succeedActionAttemptWithArtifacts(
          {
            actionKey: "missing-action" as never,
            threadId: "stale-artifact-thread",
            inputFingerprint: "a".repeat(64) as never,
            attemptCount: 1,
          },
          [{ threadId: "stale-artifact-thread", kind: "script", data: { unsafe: "orphan" } }],
        ),
      /rejected/,
    )
    assert.deepEqual(store.listArtifacts("stale-artifact-thread"), [])
  } finally {
    store.close()
    cleanupTestDirectory(root)
  }
})

test("persists failure and requires an explicit retry generation", async () => {
  const root = createTestTemporaryDirectory("agent-pi-action-executor-")
  const store = new AgentPiStore(join(root, "executor.db"))
  const snapshot = buildInitialSnapshot("executor-retry-thread")
  const request = {
    action: "run_copywriter" as const,
    idempotencyKey: actionIdempotencyKey(snapshot, "run_copywriter"),
  }
  let effects = 0
  const executor = new ParentActionExecutor(adapter(store))
  store.createThread({ id: snapshot.plan!.threadId })
  try {
    const failed = await executor.execute({
      snapshot,
      request,
      effect: async () => {
        effects += 1
        throw new Error("bounded specialist failure")
      },
    })
    assert.equal(failed.status, "failed")
    assert.equal(effects, 1)

    const blocked = await executor.execute({ snapshot, request, effect: async () => ({}) })
    assert.equal(blocked.status, "retry_required")
    assert.equal(effects, 1)

    const retried = await executor.execute({
      snapshot,
      request,
      retryFailed: true,
      effect: async ({ attempt }) => {
        effects += 1
        assert.equal(attempt.attemptCount, 2)
        return { outcome: { recovered: true } }
      },
    })
    assert.equal(retried.status, "succeeded")
    assert.equal(effects, 2)
  } finally {
    store.close()
    cleanupTestDirectory(root)
  }
})

test("resumes a claimed provider-idempotent effect with the same attempt generation", async () => {
  const root = createTestTemporaryDirectory("agent-pi-action-executor-")
  const store = new AgentPiStore(join(root, "executor.db"))
  const snapshot = buildInitialSnapshot("executor-provider-thread")
  const request = {
    action: "run_copywriter" as const,
    idempotencyKey: actionIdempotencyKey(snapshot, "run_copywriter"),
  }
  store.createThread({ id: snapshot.plan!.threadId })
  const fingerprint = createInputSnapshotFingerprint({
    plan: snapshot.plan,
    checkpoint: snapshot.checkpoint,
    artifacts: snapshot.artifacts,
    action: request.action,
    artifactIdsByKind: {},
  })
  store.beginActionAttempt(
    toJournalBeginInput({
      actionKey: createActionKey(request.idempotencyKey),
      threadId: snapshot.plan!.threadId,
      planId: snapshot.plan!.id,
      mode: snapshot.plan!.mode,
      action: request.action,
      inputFingerprint: fingerprint,
    }),
  )
  let effects = 0
  try {
    const result = await new ParentActionExecutor(adapter(store)).execute({
      snapshot,
      request,
      resumeInProgress: true,
      effect: async ({ attempt }) => {
        effects += 1
        assert.equal(attempt.attemptCount, 1)
        return { outcome: { providerReused: true } }
      },
    })
    assert.equal(result.status, "succeeded")
    assert.equal(effects, 1)
  } finally {
    store.close()
    cleanupTestDirectory(root)
  }
})

test("never claims or runs an effect for a non-canonical request", async () => {
  const root = createTestTemporaryDirectory("agent-pi-action-executor-")
  const store = new AgentPiStore(join(root, "executor.db"))
  const snapshot = buildInitialSnapshot("executor-reject-thread")
  let effects = 0
  try {
    const result = await new ParentActionExecutor(adapter(store)).execute({
      snapshot,
      request: { action: "render", idempotencyKey: actionIdempotencyKey(snapshot, "render") },
      effect: async () => {
        effects += 1
        return {}
      },
    })
    assert.equal(result.status, "rejected")
    assert.equal(effects, 0)
    assert.deepEqual(store.listActionAttempts(snapshot.plan!.threadId), [])
  } finally {
    store.close()
    cleanupTestDirectory(root)
  }
})
