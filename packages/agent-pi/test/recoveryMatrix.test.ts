import assert from "node:assert/strict"
import { join } from "node:path"
import { afterEach, describe, it } from "node:test"
import { AgentRuntimeManager } from "../src/session.js"
import { ThreadEventBus, encodeSseEvent } from "../src/events.js"
import { AgentPiStore } from "../src/store.js"
import {
  buildAllCheckpointFixtures,
  buildClarificationFixtures,
  buildInitialSnapshot,
  seedCheckpointFixture,
  snapshotFromStore,
  type RecoveryCheckpointFixture,
} from "./recoveryFixtures.js"
import { deriveCoordinatorDecision, evaluateDirectAction, actionIdempotencyKey } from "../src/coordinator.js"
import { cleanupTestDirectory, createTestTemporaryDirectory } from "../src/testCleanup.js"

const stores: AgentPiStore[] = []

afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

function createStore(): AgentPiStore {
  const store = new AgentPiStore(":memory:")
  stores.push(store)
  return store
}

function seed(store: AgentPiStore, fixture: RecoveryCheckpointFixture): string {
  const threadId = store.createThread({ id: fixture.checkpoint.artifactId ? fixture.plan.threadId : undefined }).id
  seedCheckpointFixture(store, threadId, fixture)
  return threadId
}

function persistedState(store: AgentPiStore, threadId: string): string {
  return JSON.stringify({
    thread: store.getThread(threadId),
    plan: store.getPipelinePlan(threadId),
    artifacts: store.listArtifacts(threadId),
    events: store.listEvents(threadId),
  })
}

async function resumeWithMockedSession(
  store: AgentPiStore,
  threadId: string,
  decision: Record<string, unknown>,
): Promise<number> {
  const eventBus = new ThreadEventBus(store)
  let prompts = 0
  const runtime = {
    store,
    eventBus,
    sendMessage: async () => {
      prompts += 1
    },
  }
  await AgentRuntimeManager.prototype.resumeCheckpoint.call(
    runtime as unknown as AgentRuntimeManager,
    threadId,
    decision,
  )
  return prompts
}

describe("checkpoint/restart recovery fixtures", () => {
  it("builds every implemented checkpoint and both clarification fixtures", () => {
    const checkpoints = buildAllCheckpointFixtures()
    assert.deepEqual(
      checkpoints.map((fixture) => fixture.checkpoint.type),
      [
        "script_checkpoint",
        "direction_checkpoint",
        "qa_report_checkpoint",
        "audio_chart_checkpoint",
        "capability_gap_checkpoint",
        "final_review_checkpoint",
      ],
    )
    assert.deepEqual(
      buildClarificationFixtures().map((fixture) => fixture.kind),
      ["intake_clarification", "target_clarification"],
    )
  })

  it("stops at every checkpoint and derives the same boundary after JSON restart", () => {
    for (const fixture of buildAllCheckpointFixtures("boundary")) {
      assert.equal(deriveCoordinatorDecision(fixture.snapshot).kind, "wait_for_human", fixture.name)
      const restored = JSON.parse(JSON.stringify(fixture.snapshot))
      assert.deepEqual(deriveCoordinatorDecision(restored), deriveCoordinatorDecision(fixture.snapshot), fixture.name)
    }
  })

  it("supports approval, rejection, and revision without a model or production side effect", async () => {
    for (const fixture of buildAllCheckpointFixtures("decision")) {
      const approvedStore = createStore()
      const approvedThreadId = seed(approvedStore, fixture)
      assert.equal(await resumeWithMockedSession(approvedStore, approvedThreadId, fixture.approve), 1, fixture.name)
      const approvedState = snapshotFromStore(approvedStore, approvedThreadId)
      assert.equal(approvedState.checkpoint, null, fixture.name)
      assert.equal(
        approvedState.artifacts.find((artifact) => artifact.id === fixture.checkpoint.artifactId)?.approved,
        true,
      )
      assert.equal(approvedState.plan?.decisions.length, 1, fixture.name)
      assert.equal(approvedState.plan?.decisions[0]?.status, "approved", fixture.name)
      assert.equal(deriveCoordinatorDecision(approvedState).action, fixture.expectedAfterApproval, fixture.name)
      if (fixture.checkpoint.type === "capability_gap_checkpoint") {
        assert.equal(approvedState.plan?.status, "blocked")
        assert.equal(approvedState.plan?.currentStepId, "scene_creation")
      }

      const rejectedStore = createStore()
      const rejectedThreadId = seed(rejectedStore, {
        ...fixture,
        plan: structuredClone(fixture.plan),
        artifacts: structuredClone(fixture.artifacts),
      })
      assert.equal(await resumeWithMockedSession(rejectedStore, rejectedThreadId, fixture.reject), 1, fixture.name)
      const rejectedState = snapshotFromStore(rejectedStore, rejectedThreadId)
      assert.equal(rejectedState.checkpoint, null, fixture.name)
      assert.equal(
        rejectedState.artifacts.find((artifact) => artifact.id === fixture.checkpoint.artifactId)?.approved,
        false,
      )
      assert.equal(rejectedState.plan?.decisions[0]?.status, "changes_requested", fixture.name)
      assert.equal(deriveCoordinatorDecision(rejectedState).action, fixture.expectedAfterRejection, fixture.name)
    }
  })

  it("rejects repeated, stale, and malformed decisions before mutating state", async () => {
    for (const fixture of buildAllCheckpointFixtures("validation")) {
      const store = createStore()
      const threadId = seed(store, fixture)
      await resumeWithMockedSession(store, threadId, fixture.approve)
      const decisionCount = store.getPipelinePlan(threadId)?.decisions.length
      const eventCount = store.listEvents(threadId).length
      await assert.rejects(
        () => resumeWithMockedSession(store, threadId, fixture.approve),
        /no pending checkpoint/i,
        fixture.name,
      )
      assert.equal(store.getPipelinePlan(threadId)?.decisions.length, decisionCount, fixture.name)
      assert.equal(store.listEvents(threadId).length, eventCount, fixture.name)

      const staleCheckpointStore = createStore()
      const staleCheckpointThreadId = seed(staleCheckpointStore, fixture)
      const beforeStaleCheckpoint = persistedState(staleCheckpointStore, staleCheckpointThreadId)
      await assert.rejects(
        () =>
          resumeWithMockedSession(staleCheckpointStore, staleCheckpointThreadId, {
            ...fixture.approve,
            checkpointId: "old-checkpoint-id",
          }),
        /stale checkpoint/i,
        fixture.name,
      )
      assert.equal(persistedState(staleCheckpointStore, staleCheckpointThreadId), beforeStaleCheckpoint)

      const staleArtifactStore = createStore()
      const staleArtifactThreadId = seed(staleArtifactStore, fixture)
      const beforeStaleArtifact = persistedState(staleArtifactStore, staleArtifactThreadId)
      await assert.rejects(
        () =>
          resumeWithMockedSession(staleArtifactStore, staleArtifactThreadId, {
            ...fixture.approve,
            artifactId: "old-artifact-id",
          }),
        /stale artifact/i,
        fixture.name,
      )
      assert.equal(persistedState(staleArtifactStore, staleArtifactThreadId), beforeStaleArtifact)

      const malformedStore = createStore()
      const malformedThreadId = seed(malformedStore, fixture)
      const beforeMalformed = persistedState(malformedStore, malformedThreadId)
      await assert.rejects(
        () =>
          resumeWithMockedSession(malformedStore, malformedThreadId, {
            checkpointId: fixture.checkpoint.id,
            artifactId: fixture.checkpoint.artifactId,
            approved: "true",
          }),
        /boolean.*approved/i,
        fixture.name,
      )
      assert.equal(persistedState(malformedStore, malformedThreadId), beforeMalformed)
    }
  })

  it("rejects missing, cross-thread, stale-version, and superseded checkpoint artifacts without mutation", async () => {
    const fixture = buildAllCheckpointFixtures("artifact-validation")[0]!

    const missingStore = createStore()
    const missingThreadId = missingStore.createThread({ id: fixture.plan.threadId }).id
    missingStore.savePipelinePlan(fixture.plan)
    missingStore.setCheckpoint(missingThreadId, fixture.checkpoint)
    const beforeMissing = persistedState(missingStore, missingThreadId)
    await assert.rejects(
      () => resumeWithMockedSession(missingStore, missingThreadId, fixture.approve),
      /missing artifact/i,
    )
    assert.equal(persistedState(missingStore, missingThreadId), beforeMissing)

    const crossThreadStore = createStore()
    const ownerId = crossThreadStore.createThread({ id: "artifact-owner" }).id
    const targetId = crossThreadStore.createThread({ id: "checkpoint-owner" }).id
    const foreignArtifact = crossThreadStore.saveArtifact({
      id: "foreign-artifact",
      threadId: ownerId,
      kind: "script",
      data: { title: "Foreign", objective: "Do not approve", scenes: [] },
    })
    crossThreadStore.setCheckpoint(targetId, {
      ...fixture.checkpoint,
      artifactId: foreignArtifact.id,
      payload: { artifactId: foreignArtifact.id, version: foreignArtifact.version },
    })
    const beforeCrossThread = persistedState(crossThreadStore, targetId)
    await assert.rejects(
      () =>
        resumeWithMockedSession(crossThreadStore, targetId, {
          approved: true,
          artifactId: foreignArtifact.id,
          version: foreignArtifact.version,
        }),
      /different thread/i,
    )
    assert.equal(persistedState(crossThreadStore, targetId), beforeCrossThread)
    assert.equal(crossThreadStore.getArtifact(foreignArtifact.id)?.approved, false)

    const wrongKindStore = createStore()
    const wrongKindThreadId = wrongKindStore.createThread({ id: "wrong-kind" }).id
    const wrongKindArtifact = wrongKindStore.saveArtifact({
      threadId: wrongKindThreadId,
      kind: "direction",
      data: { title: "Not a script", scenes: [] },
    })
    wrongKindStore.setCheckpoint(wrongKindThreadId, {
      id: "wrong-kind-checkpoint",
      type: "script_checkpoint",
      artifactId: wrongKindArtifact.id,
      payload: { artifactId: wrongKindArtifact.id, version: wrongKindArtifact.version },
    })
    const beforeWrongKind = persistedState(wrongKindStore, wrongKindThreadId)
    await assert.rejects(
      () => resumeWithMockedSession(wrongKindStore, wrongKindThreadId, { approved: true }),
      /cannot approve artifact kind/i,
    )
    assert.equal(persistedState(wrongKindStore, wrongKindThreadId), beforeWrongKind)

    const artifactlessStore = createStore()
    const artifactlessThreadId = artifactlessStore.createThread({ id: "artifactless" }).id
    artifactlessStore.setCheckpoint(artifactlessThreadId, {
      id: "artifactless-checkpoint",
      type: "script_checkpoint",
      artifactId: null,
      payload: {},
    })
    const beforeArtifactless = persistedState(artifactlessStore, artifactlessThreadId)
    await assert.rejects(
      () => resumeWithMockedSession(artifactlessStore, artifactlessThreadId, { approved: true }),
      /requires a checkpoint artifact/i,
    )
    assert.equal(persistedState(artifactlessStore, artifactlessThreadId), beforeArtifactless)

    const staleVersionStore = createStore()
    const staleVersionThreadId = seed(staleVersionStore, fixture)
    const staleVersionCheckpoint = staleVersionStore.getThread(staleVersionThreadId)!.checkpoint!
    staleVersionStore.setCheckpoint(staleVersionThreadId, {
      ...staleVersionCheckpoint,
      payload: { ...(staleVersionCheckpoint.payload as object), version: 99 },
    })
    const beforeStaleVersion = persistedState(staleVersionStore, staleVersionThreadId)
    await assert.rejects(
      () => resumeWithMockedSession(staleVersionStore, staleVersionThreadId, { approved: true }),
      /version .* does not match/i,
    )
    assert.equal(persistedState(staleVersionStore, staleVersionThreadId), beforeStaleVersion)

    const supersededStore = createStore()
    const supersededThreadId = seed(supersededStore, fixture)
    supersededStore.saveArtifact({
      threadId: supersededThreadId,
      kind: "script",
      data: { title: "Newer", objective: "Supersedes checkpoint", scenes: [] },
    })
    const beforeSuperseded = persistedState(supersededStore, supersededThreadId)
    await assert.rejects(
      () => resumeWithMockedSession(supersededStore, supersededThreadId, { approved: true }),
      /stale artifact/i,
    )
    assert.equal(persistedState(supersededStore, supersededThreadId), beforeSuperseded)
  })

  it("keeps legacy approved-only decisions compatible", async () => {
    const fixture = buildAllCheckpointFixtures("legacy-decision")[0]!
    const store = createStore()
    const threadId = seed(store, fixture)
    assert.equal(await resumeWithMockedSession(store, threadId, { approved: true }), 1)
    assert.equal(store.getThread(threadId)?.checkpoint, null)
    assert.equal(store.getArtifact(fixture.checkpoint.artifactId!)?.approved, true)
  })
})

describe("SSE replay and interrupted action boundaries", () => {
  it("replays strictly after Last-Event-ID, keeps order, and does not duplicate a live event", () => {
    const store = createStore()
    const thread = store.createThread({ id: "sse-thread" })
    const other = store.createThread({ id: "other-thread" })
    const eventBus = new ThreadEventBus(store)
    const first = eventBus.publish({ threadId: thread.id, type: "message_delta", payload: { delta: "one" } })
    eventBus.publish({ threadId: other.id, type: "agent_end", payload: {} })
    const second = eventBus.publish({ threadId: thread.id, type: "checkpoint", payload: { id: "cp-1" } })

    assert.deepEqual(
      store.listEvents(thread.id, 0).map((event) => event.seq),
      [first.seq, second.seq],
    )
    assert.deepEqual(
      store.listEvents(thread.id, first.seq).map((event) => event.seq),
      [second.seq],
    )
    assert.deepEqual(
      store.listEvents(thread.id, second.seq).map((event) => event.seq),
      [],
    )
    assert.equal(encodeSseEvent(second).startsWith(`id: t2:${second.seq}\nevent: checkpoint`), true)

    const received: number[] = []
    const unsubscribe = eventBus.subscribe(thread.id, (event) => received.push(event.seq!))
    const third = eventBus.publish({ threadId: thread.id, type: "agent_end", payload: {} })
    unsubscribe()
    assert.deepEqual(received, [third.seq])
    assert.deepEqual(
      store.listEvents(thread.id, second.seq).map((event) => event.seq),
      [third.seq],
    )
  })

  it("preserves per-thread replay ordering when global sequence numbers have gaps", () => {
    const store = createStore()
    const thread = store.createThread({ id: "gap-thread" })
    const other = store.createThread({ id: "gap-other" })
    const first = store.appendEvent({ threadId: thread.id, type: "plan_updated", payload: { n: 1 } })
    store.appendEvent({ threadId: other.id, type: "plan_updated", payload: { n: 2 } })
    const third = store.appendEvent({ threadId: thread.id, type: "plan_updated", payload: { n: 3 } })

    assert.deepEqual(
      store.listEvents(thread.id, first.seq).map((event) => event.payload),
      [{ n: 3 }],
    )
    assert.equal(third.seq! > first.seq!, true)
  })
})

describe("mocked exactly-once action boundary", () => {
  it("treats an executed action key as idempotent after interruption/restart", () => {
    const initial = buildInitialSnapshot("action-thread")
    const request = {
      action: "run_copywriter" as const,
      idempotencyKey: actionIdempotencyKey(initial, "run_copywriter"),
    }
    const sideEffects: string[] = []
    const first = evaluateDirectAction(initial, request)
    assert.equal(first.status, "ready")
    sideEffects.push(request.idempotencyKey)

    const restarted = JSON.parse(
      JSON.stringify({ ...initial, executedActionKeys: [request.idempotencyKey] }),
    ) as typeof initial
    const resumed = evaluateDirectAction(restarted, request)
    assert.equal(resumed.status, "idempotent")
    assert.deepEqual(sideEffects, [request.idempotencyKey])
  })

  it("cannot bypass a pending checkpoint with a later action", () => {
    const fixture = buildAllCheckpointFixtures("bypass")[0]!
    const request = {
      action: "publish" as const,
      idempotencyKey: actionIdempotencyKey(fixture.snapshot, "publish"),
    }
    const result = evaluateDirectAction(fixture.snapshot, request)
    assert.equal(result.status, "rejected")
  })

  it("keeps intake and target clarification explicit without pretending they are runtime checkpoints", () => {
    for (const fixture of buildClarificationFixtures()) {
      assert.equal(fixture.snapshot.checkpoint, null)
      assert.match(fixture.question, /subject|target/i)
      assert.equal("checkpoint" in fixture, false)
    }
  })
})

describe("durable restart serialization", () => {
  it("reloads a checkpoint, artifacts, plan, and event cursor from SQLite", () => {
    const directory = createTestTemporaryDirectory("agent-pi-cleanup-")
    const dbPath = join(directory, "recovery.db")
    const fixture = buildAllCheckpointFixtures("sqlite")[1]!
    const first = new AgentPiStore(dbPath)
    const threadId = first.createThread({ id: fixture.plan.threadId }).id
    seedCheckpointFixture(first, threadId, fixture)
    const event = first.appendEvent({ threadId, type: "checkpoint", payload: fixture.checkpoint })
    first.close()

    const restarted = new AgentPiStore(dbPath)
    stores.push(restarted)
    const restored = snapshotFromStore(restarted, threadId)
    assert.equal(restored.checkpoint?.id, fixture.checkpoint.id)
    assert.equal(restored.artifacts.length, fixture.artifacts.length)
    assert.equal(restored.plan?.id, fixture.plan.id)
    assert.deepEqual(
      restarted.listEvents(threadId, event.seq).map((item) => item.seq),
      [],
    )
    restarted.close()
    stores.splice(stores.indexOf(restarted), 1)
    cleanupTestDirectory(directory)
  })
})
