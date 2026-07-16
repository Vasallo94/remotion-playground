import { createActionKey, createInputSnapshotFingerprint, type DirectActionJournalAdapter } from "./actionJournal.js"
import {
  applyCoordinatorEffects,
  validateParentEffectOverride,
  type CoordinatorSnapshot,
  type DirectActionEvaluation,
  type DirectActionRequest,
  type NextStateEffect,
} from "./coordinator.js"
import type { ActionArtifactCommitResult, SaveArtifactInput } from "./store.js"
import type {
  ActionAttemptError,
  ActionAttemptRecord,
  ArtifactRecord,
  BeginActionAttemptOptions,
  CheckpointRecord,
} from "./types.js"

export interface ParentActionEffectContext {
  readonly evaluation: DirectActionEvaluation
  readonly attempt: ActionAttemptRecord
}

export interface ParentActionEffectResult {
  readonly outcome?: unknown
  /** Internal artifact drafts are committed in the same SQLite transaction as action success. */
  readonly artifacts?: readonly SaveArtifactInput[]
  readonly checkpoint?: CheckpointRecord | null
  /** Parent-authored conditional effect; only coordinator-whitelisted variants are accepted. */
  readonly planEffects?: readonly NextStateEffect[]
  readonly artifactMetadata?: unknown
  readonly effectMetadata?: unknown
}

export type ParentActionEffect = (context: ParentActionEffectContext) => Promise<ParentActionEffectResult>

export interface ExecuteParentActionInput {
  readonly snapshot: CoordinatorSnapshot
  readonly request: DirectActionRequest
  readonly effect: ParentActionEffect
  readonly retryFailed?: boolean
  /** Only for effects whose external provider guarantees reuse of this exact action key and fingerprint. */
  readonly resumeInProgress?: boolean
}

export type ParentActionExecutionResult =
  | { readonly status: "rejected"; readonly evaluation: DirectActionEvaluation }
  | {
      readonly status: "idempotent"
      readonly evaluation: DirectActionEvaluation
      readonly attempt: ActionAttemptRecord
    }
  | {
      readonly status: "in_progress" | "retry_required" | "conflict"
      readonly evaluation: DirectActionEvaluation
      readonly attempt: ActionAttemptRecord
    }
  | {
      readonly status: "succeeded"
      readonly evaluation: DirectActionEvaluation
      readonly attempt: ActionAttemptRecord
      readonly result: ParentActionEffectResult
      readonly committedArtifacts: readonly ArtifactRecord[]
      readonly committedCheckpoint: CheckpointRecord | null
    }
  | {
      readonly status: "failed"
      readonly evaluation: DirectActionEvaluation
      readonly attempt: ActionAttemptRecord
      readonly error: ActionAttemptError
    }

function actionError(error: unknown): ActionAttemptError {
  if (error instanceof Error) return { code: "parent_action_failed", message: error.message }
  return { code: "parent_action_failed", message: String(error) }
}

/**
 * Deterministic parent boundary: pure coordinator evaluation first, durable claim second, effect last.
 * The executor never chooses an action and never knows specialist, render, publication, or promotion APIs.
 */
export interface ParentActionExecutorJournal extends DirectActionJournalAdapter {
  get?: (threadId: string, actionKey: string) => ActionAttemptRecord | null
  succeedWithArtifacts?: (
    input: Parameters<DirectActionJournalAdapter["succeed"]>[0],
    artifacts: readonly SaveArtifactInput[],
    checkpoint?: CheckpointRecord | null,
    plan?: CoordinatorSnapshot["plan"],
  ) => ActionArtifactCommitResult
}

export class ParentActionExecutor {
  constructor(private readonly journal: ParentActionExecutorJournal) {}

  async execute(input: ExecuteParentActionInput): Promise<ParentActionExecutionResult> {
    const evaluation = this.journal.evaluate(input.snapshot, input.request)
    if (evaluation.status === "rejected") return { status: "rejected", evaluation }
    if (evaluation.status === "idempotent") {
      const threadId = input.snapshot.plan?.threadId
      const attempt = threadId && this.journal.get ? this.journal.get(threadId, input.request.idempotencyKey) : null
      if (!attempt || attempt.status !== "succeeded") {
        throw new Error("Coordinator snapshots must not claim execution without a matching durable journal attempt")
      }
      return { status: "idempotent", evaluation, attempt }
    }
    if (!input.snapshot.plan) throw new Error("A canonical persisted plan is required before parent action execution")

    const fingerprint = createInputSnapshotFingerprint({
      plan: input.snapshot.plan,
      checkpoint: input.snapshot.checkpoint,
      artifacts: input.snapshot.artifacts,
      action: input.request.action,
      artifactIdsByKind: input.request.artifactIdsByKind ?? {},
    })
    const beginOptions: BeginActionAttemptOptions = { retryFailed: input.retryFailed === true }
    const begun = this.journal.begin(
      {
        actionKey: createActionKey(input.request.idempotencyKey),
        threadId: input.snapshot.plan.threadId,
        planId: input.snapshot.plan.id,
        mode: input.snapshot.plan.mode,
        action: input.request.action,
        inputFingerprint: fingerprint,
        artifactMetadata: input.request.artifactIdsByKind ?? {},
      },
      beginOptions,
    )

    if (begun.status === "succeeded") {
      return { status: "idempotent", evaluation, attempt: begun.record }
    }
    if (begun.status === "in_progress" && input.resumeInProgress !== true) {
      return { status: "in_progress", evaluation, attempt: begun.record }
    }
    if (begun.status === "failed") {
      return { status: "retry_required", evaluation, attempt: begun.record }
    }
    if (begun.status === "conflict") {
      return { status: "conflict", evaluation, attempt: begun.record }
    }

    const activeAttempt = begun.record
    let result: ParentActionEffectResult
    try {
      result = await input.effect({ evaluation, attempt: activeAttempt })
    } catch (error) {
      const normalized = actionError(error)
      const failure = this.journal.fail({
        actionKey: activeAttempt.actionKey,
        threadId: activeAttempt.threadId,
        inputFingerprint: activeAttempt.inputFingerprint,
        attemptCount: activeAttempt.attemptCount,
        error: normalized,
      })
      if (failure.status === "rejected") {
        throw new Error(`Durable parent action failure was rejected: ${failure.reason}`)
      }
      if (failure.status !== "failed") throw new Error("Failure mutation unexpectedly succeeded")
      return { status: "failed", evaluation, attempt: failure.record, error: normalized }
    }

    const completionInput = {
      actionKey: activeAttempt.actionKey,
      threadId: activeAttempt.threadId,
      inputFingerprint: activeAttempt.inputFingerprint,
      attemptCount: activeAttempt.attemptCount,
      outcome: result.outcome,
      artifactMetadata: result.artifactMetadata,
      effectMetadata: result.effectMetadata,
    }
    const effects = result.planEffects
      ? validateParentEffectOverride(input.request.action, result.planEffects)
      : (evaluation.success?.nextStateEffects ?? [])
    const requiresAtomicCommit = Boolean(result.artifacts || result.checkpoint || effects.length > 0)
    if (requiresAtomicCommit && !this.journal.succeedWithArtifacts) {
      throw new Error("Artifact/checkpoint/plan actions require an atomic parent commit adapter")
    }
    const updatedPlan = input.snapshot.plan ? applyCoordinatorEffects(input.snapshot.plan, effects) : null
    const atomic = requiresAtomicCommit
      ? this.journal.succeedWithArtifacts!(completionInput, result.artifacts ?? [], result.checkpoint, updatedPlan)
      : { completion: this.journal.succeed(completionInput), artifacts: [], checkpoint: null }
    const completion = atomic.completion
    if (completion.status === "rejected") {
      throw new Error(`Durable parent action completion was rejected: ${completion.reason}`)
    }
    if (completion.status !== "succeeded") throw new Error("Success mutation unexpectedly failed")
    return {
      status: "succeeded",
      evaluation,
      attempt: completion.record,
      result,
      committedArtifacts: atomic.artifacts,
      committedCheckpoint: atomic.checkpoint,
    }
  }
}
