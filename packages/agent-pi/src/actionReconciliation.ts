import type { CoordinatorAction } from "./coordinator.js"
import type { AgentPiStore } from "./store.js"
import type { ArtifactKind } from "./types.js"

export type ActionRecoveryStrategy =
  | "atomic_artifact_commit"
  | "atomic_checkpoint_commit"
  | "provider_idempotency_query"
  | "content_hash_verification"
  | "no_effect"
  | "unsupported"

export interface ActionReconciliationContract {
  readonly action: CoordinatorAction
  readonly strategy: ActionRecoveryStrategy
  readonly outputArtifacts: readonly ArtifactKind[]
  readonly externalReceiptRequired: boolean
  readonly interruptedAttempt: "fail_for_explicit_retry" | "query_then_complete_or_fail" | "never_retry"
}

const contract = (
  action: CoordinatorAction,
  strategy: ActionRecoveryStrategy,
  outputArtifacts: readonly ArtifactKind[] = [],
  externalReceiptRequired = false,
): ActionReconciliationContract => ({
  action,
  strategy,
  outputArtifacts,
  externalReceiptRequired,
  interruptedAttempt:
    strategy === "provider_idempotency_query" || strategy === "content_hash_verification"
      ? "query_then_complete_or_fail"
      : strategy === "no_effect" || strategy === "unsupported"
        ? "never_retry"
        : "fail_for_explicit_retry",
})

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  }
  return value
}

/** Every canonical action has one parent-owned crash-window policy before session wiring is allowed. */
export const ACTION_RECONCILIATION_CONTRACTS: Readonly<Record<CoordinatorAction, ActionReconciliationContract>> =
  deepFreeze({
    create_plan: contract("create_plan", "atomic_artifact_commit"),
    run_intake: contract("run_intake", "atomic_artifact_commit", ["production_brief"]),
    resolve_target: contract("resolve_target", "atomic_artifact_commit", ["selected_target"]),
    research_or_skip: contract("research_or_skip", "atomic_artifact_commit", ["research"]),
    run_copywriter: contract("run_copywriter", "atomic_artifact_commit", ["script", "script_markdown"]),
    run_scene_composer: contract("run_scene_composer", "atomic_artifact_commit", ["scene_composition"]),
    generate_scene_candidate: contract("generate_scene_candidate", "atomic_checkpoint_commit", [
      "candidate_package",
      "candidate_verification",
      "candidate_promotion_plan",
    ]),
    promote_scene_candidate: contract(
      "promote_scene_candidate",
      "content_hash_verification",
      ["candidate_promotion_result", "script", "script_markdown"],
      true,
    ),
    present_script: contract("present_script", "atomic_checkpoint_commit"),
    run_direction: contract("run_direction", "atomic_artifact_commit", ["direction"]),
    revise_direction: contract("revise_direction", "atomic_artifact_commit", ["direction"]),
    present_direction: contract("present_direction", "atomic_checkpoint_commit"),
    generate_draft_config: contract("generate_draft_config", "atomic_artifact_commit", ["config", "config_lineage"]),
    run_scene_qa: contract("run_scene_qa", "atomic_artifact_commit", ["qa_report", "qa_lineage"]),
    present_scene_qa: contract("present_scene_qa", "atomic_checkpoint_commit"),
    run_audio_planner: contract("run_audio_planner", "atomic_artifact_commit", ["audio_chart"]),
    present_audio_chart: contract("present_audio_chart", "atomic_checkpoint_commit"),
    generate_final_config: contract("generate_final_config", "atomic_artifact_commit", ["config", "config_lineage"]),
    produce_audio_assets: contract("produce_audio_assets", "provider_idempotency_query", ["audio_assets"], true),
    validate_final: contract("validate_final", "atomic_artifact_commit", ["validation_report"]),
    render: contract("render", "provider_idempotency_query", ["render_job"], true),
    review_render: contract("review_render", "atomic_artifact_commit", ["render_review"]),
    present_final_review: contract("present_final_review", "atomic_checkpoint_commit"),
    publish: contract("publish", "content_hash_verification", [], true),
    wait_for_human: contract("wait_for_human", "no_effect"),
    complete: contract("complete", "no_effect"),
    unsupported_mode: contract("unsupported_mode", "unsupported"),
    invalid_plan: contract("invalid_plan", "unsupported"),
  })

export function reconciliationContractFor(action: CoordinatorAction): ActionReconciliationContract {
  return ACTION_RECONCILIATION_CONTRACTS[action]
}

export interface InterruptedActionRecoveryDecision {
  readonly action: CoordinatorAction
  readonly decision: "fail_for_explicit_retry" | "query_external_receipt" | "leave_terminal"
  readonly reason: string
}

/**
 * Pure restart decision. It never infers success from an unbound latest artifact.
 * Atomic artifact/checkpoint effects either committed with journal success or did not commit at all.
 */
function isCoordinatorAction(value: string): value is CoordinatorAction {
  return Object.prototype.hasOwnProperty.call(ACTION_RECONCILIATION_CONTRACTS, value)
}

/** Startup-only recovery for internal actions whose artifact/checkpoint commit is atomic with journal success. */
export function failInterruptedAtomicActions(store: AgentPiStore): number {
  let recovered = 0
  for (const thread of store.listThreads(10_000)) {
    for (const attempt of store.listActionAttempts(thread.id, { status: "started", limit: 10_000 })) {
      if (!isCoordinatorAction(attempt.action)) continue
      const policy = reconciliationContractFor(attempt.action)
      if (policy.interruptedAttempt !== "fail_for_explicit_retry") continue
      const result = store.failActionAttempt({
        actionKey: attempt.actionKey,
        threadId: attempt.threadId,
        inputFingerprint: attempt.inputFingerprint,
        attemptCount: attempt.attemptCount,
        error: {
          code: "parent_restart_interrupted",
          message: "Parent restarted before the atomic action commit; explicit retry is required.",
        },
      })
      if (result.status === "failed") recovered += 1
    }
  }
  return recovered
}

export function deriveInterruptedActionRecovery(action: CoordinatorAction): InterruptedActionRecoveryDecision {
  const policy = reconciliationContractFor(action)
  if (policy.interruptedAttempt === "fail_for_explicit_retry") {
    return {
      action,
      decision: "fail_for_explicit_retry",
      reason: "The atomic parent commit did not complete; do not infer success from unrelated artifacts.",
    }
  }
  if (policy.interruptedAttempt === "query_then_complete_or_fail") {
    return {
      action,
      decision: "query_external_receipt",
      reason: "Query the provider idempotency key or exact destination hash before completing or failing the attempt.",
    }
  }
  return { action, decision: "leave_terminal", reason: "This action has no recoverable effect to replay." }
}
