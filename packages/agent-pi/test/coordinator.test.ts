import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  CANONICAL_MODE_STEPS,
  CANONICAL_TRANSITIONS,
  DIRECT_ACTION_HANDLERS,
  PIPELINE_MODES,
  actionIdempotencyKey,
  deriveCoordinatorAction,
  deriveCoordinatorDecision,
  evaluateDirectAction,
  type CoordinatorSnapshot,
} from "../src/coordinator.js"
import { contentHash } from "../src/contentHash.js"
import { buildProductionBriefArtifact, type ProductionBriefCandidate } from "../src/productionBrief.js"
import type { ArtifactKind, ArtifactRecord, PipelineMode, PipelinePlan } from "../src/types.js"

const MODES: readonly PipelineMode[] = [
  "new_video",
  "revise_existing",
  "render_only",
  "recover_failed_render",
  "audit_only",
  "variant",
  "asset_regeneration",
  "question",
]

function plan(mode: PipelineMode = "new_video"): PipelinePlan {
  const steps = CANONICAL_MODE_STEPS[mode].map((step) => ({
    ...step,
    status: "pending" as const,
    summary: "",
    artifactPaths: [],
    blockers: [],
  }))
  return {
    schemaVersion: 1,
    id: "plan",
    threadId: "thread",
    mode,
    goal: "Create a video",
    status: "active",
    steps,
    decisions: [],
    currentStepId: steps[0]?.id ?? null,
    progress: { completed: 0, total: steps.length },
    createdAt: "2026-07-12T00:00:00Z",
    updatedAt: "2026-07-12T00:00:00Z",
  }
}

function artifact<T>(kind: ArtifactKind, data: T, approved = false, version = 1): ArtifactRecord<T> {
  return {
    id: `${kind}-${version}`,
    threadId: "thread",
    kind,
    version,
    path: null,
    data,
    approved,
    createdAt: "2026-07-12T00:00:00Z",
  }
}

const provided = <T>(value: T) => ({ status: "provided" as const, value, source: "user" as const })
const absent = (rationale: string) => ({ status: "explicitly_absent" as const, rationale })

function intakeArtifacts(): ArtifactRecord[] {
  const candidate: ProductionBriefCandidate = {
    subject: provided("Explicit subject"),
    objective: provided("Explicit objective"),
    audience: provided("Explicit audience"),
    language: provided("Explicit language"),
    platform: provided("Explicit platform"),
    format: provided("video/mp4"),
    dimensions: provided({ width: 1280, height: 720, unit: "px" }),
    aspectRatio: provided("16:9"),
    duration: provided({ seconds: 30 }),
    brand: absent("No brand supplied"),
    tone: absent("No tone supplied"),
    evidence: absent("No evidence supplied"),
    assets: absent("No assets supplied"),
    constraints: absent("No constraints supplied"),
    audioPreferences: absent("No audio preferences supplied"),
    targetRequirements: provided([{ name: "target.id", requirement: "target.video.001" }]),
    acceptanceCriteria: provided(["Meet the explicit objective"]),
    researchRequirement: provided("not_required"),
    researchRationale: provided("No external verification requested"),
  }
  return [
    artifact("production_brief", buildProductionBriefArtifact(candidate), true),
    artifact(
      "selected_target",
      {
        artifactType: "selected_target",
        schemaVersion: 1,
        target: { id: "target.video.001", schemaVersion: 1 },
        productionBrief: { artifactId: "production_brief-1", version: 1 },
        selector: { id: "target.video.001", format: "video/mp4", dimensions: { width: 1280, height: 720 } },
      },
      true,
    ),
  ]
}

const script = {
  title: "Measured garden",
  objective: "Explain a measured change",
  scenes: [{ id: "s1", type: "callout", durationInSeconds: 5, missingCapabilities: [] }],
}

function configLineage(
  configData: Record<string, unknown>,
  version = 1,
  directionVersion = 1,
  directionData: Record<string, unknown> = { scenes: [], warnings: [] },
): ArtifactRecord {
  return artifact(
    "config_lineage",
    {
      configArtifactId: `config-${version}`,
      configVersion: version,
      configHash: contentHash(configData),
      lineage: {
        script: { artifactId: "script-1", version: 1, contentHash: contentHash(script) },
        direction: {
          artifactId: `direction-${directionVersion}`,
          version: directionVersion,
          contentHash: contentHash(directionData),
        },
      },
    },
    true,
    version,
  )
}

function qaLineage(
  qaData: Record<string, unknown>,
  configData: Record<string, unknown>,
  qaVersion = 1,
  configVersion = 1,
): ArtifactRecord {
  return artifact(
    "qa_lineage",
    {
      schemaVersion: 1,
      qaReport: { artifactId: `qa_report-${qaVersion}`, version: qaVersion, contentHash: contentHash(qaData) },
      config: { artifactId: `config-${configVersion}`, version: configVersion, contentHash: contentHash(configData) },
    },
    true,
    qaVersion,
  )
}

function snapshot(overrides: Partial<CoordinatorSnapshot> = {}): CoordinatorSnapshot {
  return { plan: plan(), checkpoint: null, artifacts: intakeArtifacts(), ...overrides }
}

function readyForCopywriter(): CoordinatorSnapshot {
  const current = plan()
  current.steps[0]!.status = "skipped"
  return snapshot({ plan: current })
}

describe("canonical coordinator definitions", () => {
  it("freezes every mode, step, and transition definition recursively", () => {
    assert.deepEqual(Object.keys(CANONICAL_MODE_STEPS).sort(), [...MODES].sort())
    for (const mode of MODES) {
      assert.equal(Object.isFrozen(CANONICAL_MODE_STEPS[mode]), true)
      assert.equal(Object.isFrozen(CANONICAL_TRANSITIONS[mode]), true)
      assert.equal(Object.isFrozen(CANONICAL_MODE_STEPS[mode][0]), true)
      assert.equal(Object.isFrozen(CANONICAL_TRANSITIONS[mode][0]), true)
    }
    assert.equal(Object.isFrozen(DIRECT_ACTION_HANDLERS), true)
    assert.throws(() => {
      ;(PIPELINE_MODES as unknown as Array<string>)[0] = "invented_mode"
    }, TypeError)

    assert.throws(() => {
      ;(CANONICAL_MODE_STEPS.new_video[0] as unknown as { id: string }).id = "invented"
    }, TypeError)
    assert.throws(() => {
      ;(CANONICAL_MODE_STEPS.new_video as unknown as Array<unknown>).push({ id: "invented" })
    }, TypeError)
    const research = CANONICAL_TRANSITIONS.new_video.find((transition) => transition.action === "research_or_skip")!
    assert.throws(() => {
      ;(research.prerequisites as unknown as Array<unknown>).push({ type: "step_status", stepId: "invented" })
    }, TypeError)
    assert.throws(() => {
      ;(research.nextStateEffects[0] as unknown as { stepId: string }).stepId = "invented"
    }, TypeError)
    assert.throws(() => {
      ;(DIRECT_ACTION_HANDLERS.run_direction!.acceptedArtifacts[0] as unknown as { kind: ArtifactKind }).kind = "config"
    }, TypeError)
  })

  it("makes persisted intake and target artifacts real prerequisites before research", () => {
    assert.deepEqual(
      CANONICAL_TRANSITIONS.new_video.slice(0, 2).map((transition) => transition.action),
      ["run_intake", "resolve_target"],
    )
    assert.deepEqual(CANONICAL_TRANSITIONS.new_video[1]!.prerequisites, [
      { type: "checkpoint_clear" },
      { type: "artifact", artifact: { kind: "production_brief", approval: "any", required: true } },
    ])
    const research = CANONICAL_TRANSITIONS.new_video.find((transition) => transition.action === "research_or_skip")!
    assert.deepEqual(research.prerequisites.slice(1, 3), [
      { type: "artifact", artifact: { kind: "production_brief", approval: "any", required: true } },
      { type: "artifact", artifact: { kind: "selected_target", approval: "any", required: true } },
    ])
    assert.equal(deriveCoordinatorAction({ plan: plan(), checkpoint: null, artifacts: [] }), "run_intake")
    assert.equal(
      deriveCoordinatorAction({ plan: plan(), checkpoint: null, artifacts: [intakeArtifacts()[0]!] }),
      "resolve_target",
    )
    assert.equal(
      deriveCoordinatorAction({ plan: plan(), checkpoint: null, artifacts: intakeArtifacts() }),
      "research_or_skip",
    )
    const reserved = evaluateDirectAction(
      { ...snapshot(), artifacts: [] },
      {
        action: "run_intake",
        idempotencyKey: actionIdempotencyKey(snapshot(), "run_intake"),
      },
    )
    assert.equal(reserved.status, "ready")
  })

  it("rejects a selected target whose selector is not derived from the current brief", () => {
    const artifacts = intakeArtifacts()
    const selected = artifacts[1]!
    selected.data = {
      ...(selected.data as Record<string, unknown>),
      selector: { id: "target.video.003" },
    }
    assert.equal(deriveCoordinatorAction({ plan: plan(), checkpoint: null, artifacts }), "resolve_target")
  })

  it("covers every declared mode without accepting model-invented steps", () => {
    for (const mode of MODES) {
      const current = plan(mode)
      current.steps[0]!.id = `${current.steps[0]!.id}-invented`
      assert.equal(deriveCoordinatorAction({ plan: current, checkpoint: null, artifacts: [] }), "invalid_plan")

      const canonical = plan(mode)
      const decision = deriveCoordinatorDecision({ plan: canonical, checkpoint: null, artifacts: [] })
      if (mode === "new_video") assert.equal(decision.kind, "action")
      else assert.equal(decision.kind, "unsupported_mode")
    }
  })
})

describe("new_video deterministic transitions", () => {
  it("derives canonical early transitions without model-selected tool order", () => {
    assert.equal(deriveCoordinatorAction({ plan: null, checkpoint: null, artifacts: [] }), "create_plan")
    const current = plan()
    assert.equal(
      deriveCoordinatorAction({ plan: current, checkpoint: null, artifacts: intakeArtifacts() }),
      "research_or_skip",
    )
    current.steps[0]!.status = "skipped"
    assert.equal(
      deriveCoordinatorAction({ plan: current, checkpoint: null, artifacts: intakeArtifacts() }),
      "run_copywriter",
    )
    assert.equal(
      deriveCoordinatorAction({
        plan: current,
        checkpoint: null,
        artifacts: [...intakeArtifacts(), artifact("script", script)],
      }),
      "present_script",
    )
    assert.equal(
      deriveCoordinatorAction({
        plan: current,
        checkpoint: null,
        artifacts: [
          ...intakeArtifacts(),
          artifact("script", {
            ...script,
            scenes: [{ ...script.scenes[0]!, missingCapabilities: ["combined visual"] }],
          }),
        ],
      }),
      "run_scene_composer",
    )
  })

  it("routes approved capability gaps only to bounded Visual Recipe proposal data", () => {
    const current = plan()
    current.steps[0]!.status = "skipped"
    const unresolvedScript = {
      ...script,
      scenes: [{ ...script.scenes[0]!, missingCapabilities: ["timed branching behavior"] }],
    }
    const decision = deriveCoordinatorDecision({
      plan: current,
      checkpoint: null,
      artifacts: [
        ...intakeArtifacts(),
        artifact("script", unresolvedScript),
        artifact("scene_composition", { summary: "A bounded temporal visual is required", resolutions: [] }, true),
      ],
    })

    assert.equal(decision.kind, "action")
    assert.equal(decision.action, "propose_visual_recipe")
    assert.equal(decision.stepId, "scene_creation")
    assert.notEqual(decision.action, "generate_scene_candidate")
    assert.notEqual(decision.action, "promote_scene_candidate")
  })

  it("enforces checkpoint boundaries before any next transition", () => {
    const current = plan()
    current.steps[0]!.status = "skipped"
    const pending = snapshot({
      plan: current,
      checkpoint: { id: "cp", type: "script_checkpoint", artifactId: "script-1", payload: {} },
      artifacts: [artifact("script", script)],
    })
    const decision = deriveCoordinatorDecision(pending)
    assert.equal(decision.kind, "wait_for_human")
    assert.equal(decision.action, "wait_for_human")
    assert.equal(
      evaluateDirectAction(pending, {
        action: "present_script",
        idempotencyKey: actionIdempotencyKey(pending, "present_script"),
      }).status,
      "rejected",
    )
  })

  it("routes approved script through direction, config, and Scene QA", () => {
    const current = plan()
    current.steps[0]!.status = "skipped"
    const artifacts: ArtifactRecord[] = [...intakeArtifacts(), artifact("script", script, true)]
    assert.equal(deriveCoordinatorAction({ plan: current, checkpoint: null, artifacts }), "run_direction")
    artifacts.push(artifact("direction", { scenes: [], warnings: [] }))
    assert.equal(deriveCoordinatorAction({ plan: current, checkpoint: null, artifacts }), "present_direction")
    artifacts[3] = { ...artifacts[3]!, approved: true }
    assert.equal(deriveCoordinatorAction({ plan: current, checkpoint: null, artifacts }), "generate_draft_config")
    const configData = { id: "garden", scenes: [] }
    artifacts.push(artifact("config", configData), configLineage(configData))
    assert.equal(deriveCoordinatorAction({ plan: current, checkpoint: null, artifacts }), "run_scene_qa")
  })

  it("routes rejected Scene QA through direction revision, CP2, fresh config, and fresh QA", () => {
    const current = plan()
    current.steps.find((step) => step.id === "research")!.status = "skipped"
    const directionData = { scenes: [], warnings: [] }
    const configData = { id: "garden", scenes: [] }
    const direction = artifact("direction", directionData, true)
    const qa = artifact("qa_report", {
      summary: "Remove an unsupported overlay",
      scenes: [
        {
          index: 0,
          verdict: "MAJOR_ISSUE",
          score: 5,
          observations: ["Overlay is visible"],
          issues: [
            {
              category: "accuracy",
              severity: "major",
              observation: "Overlay conflicts with intent",
              evidence: "Visible in the still",
              suggestedChange: "Remove it",
            },
          ],
        },
      ],
    })
    const artifacts: ArtifactRecord[] = [
      ...intakeArtifacts(),
      artifact("script", script, true),
      direction,
      artifact("config", configData),
      configLineage(configData, 1, 1, directionData),
      qa,
      qaLineage(qa.data, configData),
      artifact(
        "direction_revision_request",
        {
          schemaVersion: 1,
          source: "scene_qa",
          feedback: "Remove the overlay",
          checkpoint: { id: "qa-cp", type: "qa_report_checkpoint" },
          baseDirection: {
            artifactId: direction.id,
            version: direction.version,
            contentHash: contentHash(direction.data),
          },
          baseConfig: { artifactId: "config-1", version: 1, contentHash: "a".repeat(64) },
          qaReport: { artifactId: qa.id, version: qa.version, contentHash: "b".repeat(64) },
        },
        true,
      ),
    ]

    const revisionSnapshot = { plan: current, checkpoint: null, artifacts }
    assert.equal(deriveCoordinatorAction(revisionSnapshot), "revise_direction")
    assert.equal(deriveCoordinatorAction(JSON.parse(JSON.stringify(revisionSnapshot))), "revise_direction")
    artifacts.push(artifact("direction", { scenes: [], warnings: [] }, false, 2))
    assert.equal(deriveCoordinatorAction({ plan: current, checkpoint: null, artifacts }), "present_direction")
    artifacts[artifacts.length - 1] = { ...artifacts.at(-1)!, approved: true }
    assert.equal(deriveCoordinatorAction({ plan: current, checkpoint: null, artifacts }), "generate_draft_config")
    artifacts.push(
      artifact("config", configData, false, 2),
      configLineage(configData, 2, 2, { scenes: [], warnings: [] }),
    )
    assert.equal(deriveCoordinatorAction({ plan: current, checkpoint: null, artifacts }), "run_scene_qa")
    artifacts.push(artifact("qa_report", qa.data, false, 2), qaLineage(qa.data, configData, 2, 2))
    assert.equal(deriveCoordinatorAction({ plan: current, checkpoint: null, artifacts }), "present_scene_qa")
  })

  it("derives the final deterministic sequence after approved creative artifacts", () => {
    const current = plan()
    for (const id of ["research", "scene_creation", "copywriting", "direction", "scene_qa", "audio_plan"]) {
      current.steps.find((step) => step.id === id)!.status = id === "scene_creation" ? "skipped" : "completed"
    }
    const directionData = { scenes: [] }
    const configData = {
      id: "garden",
      scenes: [],
      voiceover: null,
    }
    const qaData = {
      summary: "pass",
      scenes: [{ index: 0, verdict: "PASS", score: 10, observations: [], issues: [] }],
    }
    const artifacts: ArtifactRecord[] = [
      ...intakeArtifacts(),
      artifact("script", script, true),
      artifact("direction", directionData, true),
      artifact("config", configData),
      configLineage(configData, 1, 1, directionData),
      artifact("qa_report", qaData),
      qaLineage(qaData, configData),
      artifact(
        "audio_chart",
        { voiceover: null, soundDesign: { enabled: false, musicBed: null, sfx: [] }, warnings: [] },
        true,
      ),
      artifact("render_job", { id: "job", status: "done" }, true),
      artifact("render_review", { passed: true }, true),
    ]
    assert.equal(deriveCoordinatorAction({ plan: current, checkpoint: null, artifacts }), "produce_audio_assets")
    artifacts.push(artifact("audio_assets", { assets: [] }))
    const silentSnapshot = { plan: current, checkpoint: null, artifacts }
    assert.equal(deriveCoordinatorAction(silentSnapshot), "validate_final")
    assert.equal(deriveCoordinatorAction(JSON.parse(JSON.stringify(silentSnapshot))), "validate_final")
    current.steps.find((step) => step.id === "final_validation")!.status = "completed"
    assert.equal(deriveCoordinatorAction({ plan: current, checkpoint: null, artifacts }), "publish")
    current.steps.find((step) => step.id === "publication")!.status = "completed"
    assert.equal(deriveCoordinatorAction({ plan: current, checkpoint: null, artifacts }), "complete")
  })
})

describe("direct parent action handlers", () => {
  it("exposes prerequisites, accepted artifact approval, outcomes, effects, and stable idempotency keys", () => {
    const current = readyForCopywriter()
    const handler = DIRECT_ACTION_HANDLERS.run_direction
    assert(handler)
    assert.deepEqual(handler.acceptedArtifacts, [{ kind: "script", approval: true, required: true }])
    assert.equal(handler.success.status, "success")
    assert.equal(handler.failure.status, "failure")
    assert.ok(handler.success.nextStateEffects.some((effect) => effect.type === "start_step"))
    assert.equal(
      actionIdempotencyKey(current, "run_copywriter"),
      actionIdempotencyKey(structuredClone(current), "run_copywriter"),
    )
  })

  it("rejects stale and unapproved artifacts before a direct action is ready", () => {
    const current = readyForCopywriter()
    const stale = artifact("script", script, true, 1)
    const newerUnapproved = artifact("script", { ...script, title: "New draft" }, false, 2)
    const staleSnapshot = snapshot({ plan: current.plan, artifacts: [...intakeArtifacts(), stale, newerUnapproved] })

    const direction = evaluateDirectAction(staleSnapshot, {
      action: "run_direction",
      idempotencyKey: actionIdempotencyKey(staleSnapshot, "run_direction"),
      artifactIdsByKind: { script: stale.id },
    })
    assert.equal(direction.status, "rejected")
    assert.equal(direction.failure?.code, "unapproved_artifact")

    const approvedSnapshot = snapshot({ plan: current.plan, artifacts: [...intakeArtifacts(), stale] })
    const withOldId = evaluateDirectAction(approvedSnapshot, {
      action: "run_direction",
      idempotencyKey: actionIdempotencyKey(approvedSnapshot, "run_direction"),
      artifactIdsByKind: { script: "script-0" },
    })
    assert.equal(withOldId.failure?.code, "stale_artifact")
  })

  it("returns a ready result only for the canonical next action", () => {
    const current = readyForCopywriter()
    const ready = evaluateDirectAction(current, {
      action: "run_copywriter",
      idempotencyKey: actionIdempotencyKey(current, "run_copywriter"),
    })
    assert.equal(ready.status, "ready")
    assert.deepEqual(ready.success?.nextStateEffects, [{ type: "start_step", stepId: "copywriting" }])
    assert.equal(
      evaluateDirectAction(current, { action: "run_copywriter", idempotencyKey: "wrong-key" }).failure?.code,
      "invalid_idempotency_key",
    )

    const invalid = evaluateDirectAction(current, {
      action: "render",
      idempotencyKey: actionIdempotencyKey(current, "render"),
    })
    assert.equal(invalid.status, "rejected")
    assert.equal(invalid.failure?.code, "not_next_action")
  })

  it("recognizes duplicate actions as idempotent without executing side effects", () => {
    const current = readyForCopywriter()
    const request = {
      action: "run_copywriter" as const,
      idempotencyKey: actionIdempotencyKey(current, "run_copywriter"),
    }
    const first = evaluateDirectAction(current, request)
    assert.equal(first.status, "ready")
    const resumed = snapshot({
      plan: current.plan,
      artifacts: [artifact("script", script)],
      executedActionKeys: [request.idempotencyKey],
    })
    assert.equal(evaluateDirectAction(resumed, request).status, "idempotent")
    assert.deepEqual(evaluateDirectAction(resumed, request).success?.nextStateEffects, first.success?.nextStateEffects)
  })

  it("rejects invalid plans before evaluating action handlers", () => {
    const current = readyForCopywriter()
    current.plan!.steps[1]!.id = "invented_step"
    const result = evaluateDirectAction(current, {
      action: "run_copywriter",
      idempotencyKey: actionIdempotencyKey(current, "run_copywriter"),
    })
    assert.equal(result.status, "rejected")
    assert.equal(result.failure?.code, "invalid_plan")

    const metadataMutation = readyForCopywriter()
    metadataMutation.plan!.steps[0]!.owner = "invented-owner"
    assert.equal(deriveCoordinatorAction(metadataMutation), "invalid_plan")
  })
})

describe("restart and non-new-video snapshots", () => {
  it("derives the same decision after serializing and restoring a snapshot", () => {
    const current = readyForCopywriter()
    const before = snapshot({ plan: current.plan, artifacts: [artifact("script", script, true)] })
    const after = JSON.parse(JSON.stringify(before)) as CoordinatorSnapshot
    assert.deepEqual(deriveCoordinatorDecision(after), deriveCoordinatorDecision(before))
    assert.deepEqual(
      evaluateDirectAction(after, {
        action: "run_direction",
        idempotencyKey: actionIdempotencyKey(after, "run_direction"),
      }),
      evaluateDirectAction(before, {
        action: "run_direction",
        idempotencyKey: actionIdempotencyKey(before, "run_direction"),
      }),
    )
  })

  it("returns an explicit unsupported result for every non-new-video mode", () => {
    for (const mode of MODES.filter((candidate) => candidate !== "new_video")) {
      const current = snapshot({ plan: plan(mode) })
      const decision = deriveCoordinatorDecision(current)
      assert.equal(decision.kind, "unsupported_mode")
      assert.match(decision.reason ?? "", /ProductionBrief and TargetContract/)
      const result = evaluateDirectAction(current, {
        action: "run_copywriter",
        idempotencyKey: actionIdempotencyKey(current, "run_copywriter"),
      })
      assert.equal(result.status, "rejected")
      assert.equal(result.failure?.code, "unsupported_mode")
    }
  })
})
