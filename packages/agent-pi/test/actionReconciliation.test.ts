import { strict as assert } from "node:assert"
import { describe, test } from "node:test"
import { join } from "node:path"
import {
  ACTION_RECONCILIATION_CONTRACTS,
  deriveInterruptedActionRecovery,
  failInterruptedAtomicActions,
} from "../src/actionReconciliation.js"
import { createActionKey, createActionName, createInputSnapshotFingerprint } from "../src/actionJournal.js"
import { AgentPiStore } from "../src/store.js"
import { cleanupTestDirectory, createTestTemporaryDirectory } from "../src/testCleanup.js"
import { CANONICAL_TRANSITIONS, type CoordinatorAction } from "../src/coordinator.js"

const terminalActions: CoordinatorAction[] = [
  "create_plan",
  "wait_for_human",
  "complete",
  "unsupported_mode",
  "invalid_plan",
]

describe("parent action reconciliation contracts", () => {
  test("covers every canonical and terminal action with deeply immutable policy", () => {
    const actions = new Set<CoordinatorAction>(terminalActions)
    for (const transitions of Object.values(CANONICAL_TRANSITIONS)) {
      for (const transition of transitions) actions.add(transition.action)
    }
    assert.deepEqual(Object.keys(ACTION_RECONCILIATION_CONTRACTS).sort(), [...actions].sort())
    assert.ok(Object.isFrozen(ACTION_RECONCILIATION_CONTRACTS))
    for (const policy of Object.values(ACTION_RECONCILIATION_CONTRACTS)) {
      assert.ok(Object.isFrozen(policy))
      assert.ok(Object.isFrozen(policy.outputArtifacts))
    }
  })

  test("never infers internal success from an unbound latest artifact", () => {
    assert.deepEqual(deriveInterruptedActionRecovery("run_intake"), {
      action: "run_intake",
      decision: "fail_for_explicit_retry",
      reason: "The atomic parent commit did not complete; do not infer success from unrelated artifacts.",
    })
    assert.equal(deriveInterruptedActionRecovery("generate_final_config").decision, "fail_for_explicit_retry")
  })

  test("fails interrupted internal claims for explicit retry after startup", () => {
    const root = createTestTemporaryDirectory("agent-pi-action-executor-")
    const databasePath = join(root, "recovery.db")
    let store = new AgentPiStore(databasePath)
    try {
      store.createThread({ id: "recovery-thread" })
      const fingerprint = createInputSnapshotFingerprint({ attempt: 1 })
      const begun = store.beginActionAttempt({
        actionKey: createActionKey("recovery-thread:plan:run_intake:v1"),
        threadId: "recovery-thread",
        planId: "plan",
        mode: "new_video",
        action: createActionName("run_intake"),
        inputFingerprint: fingerprint,
      })
      assert.equal(begun.status, "started")
      store.close()

      store = new AgentPiStore(databasePath)
      assert.equal(failInterruptedAtomicActions(store), 1)
      const attempt = store.listActionAttempts("recovery-thread")[0]
      assert.equal(attempt?.status, "failed")
      assert.equal(attempt?.error?.code, "parent_restart_interrupted")
      assert.equal(failInterruptedAtomicActions(store), 0)
    } finally {
      store.close()
      cleanupTestDirectory(root)
    }
  })

  test("requires provider or content evidence for external effects", () => {
    for (const action of ["produce_audio_assets", "render", "publish"] as const) {
      const policy = ACTION_RECONCILIATION_CONTRACTS[action]
      assert.equal(policy.externalReceiptRequired, true)
      assert.equal(deriveInterruptedActionRecovery(action).decision, "query_external_receipt")
    }
    assert.equal(deriveInterruptedActionRecovery("validate_final").decision, "fail_for_explicit_retry")
  })
})
