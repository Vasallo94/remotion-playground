import { createHash } from "node:crypto"
import type {
  ActionAttemptMutationResult,
  ActionKey,
  ActionName,
  BeginActionAttemptInput,
  BeginActionAttemptOptions,
  BeginActionAttemptResult,
  CompleteActionAttemptInput,
  FailActionAttemptInput,
  InputSnapshotFingerprint,
} from "./types.js"
import type {
  CoordinatorAction,
  CoordinatorSnapshot,
  DirectActionEvaluation,
  DirectActionRequest,
} from "./coordinator.js"

/** The SQLite journal is deliberately independent from specialist, render, and publication runners. */
export const ACTION_JOURNAL_SCHEMA_VERSION = 1 as const

export function createActionKey(value: string): ActionKey {
  if (value.trim().length === 0) throw new Error("Action key must not be empty")
  return value as ActionKey
}

export function createActionName(value: CoordinatorAction | string): ActionName {
  if (value.trim().length === 0) throw new Error("Action name must not be empty")
  return value as ActionName
}

export function createInputSnapshotFingerprint(snapshot: unknown): InputSnapshotFingerprint {
  const serialized = stableSerialize(snapshot)
  return createHash("sha256").update(serialized).digest("hex") as InputSnapshotFingerprint
}

function stableSerialize(value: unknown): string {
  const normalized = normalizeForFingerprint(value, new WeakSet<object>())
  return JSON.stringify(normalized)
}

function normalizeForFingerprint(value: unknown, ancestors: WeakSet<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error("Input snapshot numbers must be finite JSON numbers and must not be negative zero")
    }
    return value
  }
  if (typeof value !== "object") throw new Error("Input snapshot must contain only JSON-compatible values")
  if (ancestors.has(value)) throw new Error("Input snapshot must not contain circular references")

  ancestors.add(value)
  try {
    if (Array.isArray(value)) return value.map((item) => normalizeForFingerprint(item, ancestors))
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Input snapshot objects must be plain JSON objects")
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, normalizeForFingerprint(item, ancestors)]),
    )
  } finally {
    ancestors.delete(value)
  }
}

/**
 * Exact future executor boundary. The parent evaluates a pure action first, then journals the attempt before
 * invoking any effectful handler. This interface intentionally contains no specialist, render, or publication API.
 */
export interface DirectActionJournalAdapter {
  evaluate(snapshot: CoordinatorSnapshot, request: DirectActionRequest): DirectActionEvaluation
  begin(input: DirectActionJournalRequest, options?: BeginActionAttemptOptions): BeginActionAttemptResult
  succeed(input: CompleteActionAttemptInput): ActionAttemptMutationResult
  fail(input: FailActionAttemptInput): ActionAttemptMutationResult
}

/** Adapter input preserves the coordinator action union while the durable journal stores a nominal action name. */
export interface DirectActionJournalRequest extends Omit<BeginActionAttemptInput, "action"> {
  readonly action: CoordinatorAction
}

export function toJournalBeginInput(input: DirectActionJournalRequest): BeginActionAttemptInput {
  return { ...input, action: createActionName(input.action) }
}
