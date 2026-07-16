import { strict as assert } from "node:assert"
import { test } from "node:test"
import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import Database from "better-sqlite3"
import {
  CandidatePromotionJournal,
  createCandidatePromotionCheckpoint,
  createCandidatePromotionPlan,
  createNodePromotionFileSystem,
  createCandidatePromotionApproval,
  hashCanonicalPromotionValue,
  promoteCandidate,
  registerCandidateVerification,
  recoverCandidatePromotions,
  rollbackCandidatePromotion,
  type PromotionFileSystem,
} from "../src/candidatePromotion.js"
import { type CandidateManifest } from "../src/candidatePolicy.js"
import {
  createQuarantineJob,
  createQuarantineWorkspace,
  cleanupQuarantineWorkspace,
  runQuarantineVerification,
  type QuarantineCommand,
  type QuarantineVerificationHarness,
} from "../src/quarantineVerifier.js"

const sourcePath = "src/compositions/ClaudeCodeTutorial/scenes/custom/TestScene.tsx"
const registryPaths = [
  "src/compositions/ClaudeCodeTutorial/customSceneRegistry.ts",
  "src/shared/sceneTimingRegistry.ts",
  "src/shared/scene-catalog.json",
] as const
const source = `import { AbsoluteFill, useCurrentFrame } from "remotion"\n\nexport const TestScene = () => <AbsoluteFill>{useCurrentFrame()}</AbsoluteFill>\n`
const digest = (value: string) => createHash("sha256").update(value).digest("hex")

function manifest(): CandidateManifest {
  return {
    schemaVersion: 1,
    candidateId: "test-scene",
    capability: {
      proposalId: "proposal-test",
      checkpointId: "cp4-test",
      checkpointVersion: 1,
      approvalDigest: "a".repeat(64),
    },
    component: { id: "test-scene", exportName: "TestScene" },
    sourceFiles: [{ path: sourcePath, sha256: digest(source), bytes: Buffer.byteLength(source) }],
    registryChanges: registryPaths.map((path, index) => ({
      target: ["custom-scene-registry", "scene-timing-registry", "scene-catalog"][index] as
        | "custom-scene-registry"
        | "scene-timing-registry"
        | "scene-catalog",
      path,
      operation: "add" as const,
      key: "test-scene",
    })),
    dependencies: ["remotion"],
    limits: { maxFiles: 1, maxFileBytes: 32_000, maxTotalBytes: 32_000, maxAstNodes: 4_000 },
    acceptanceTests: ["unit", "typecheck", "lint", "bundle", "still"].map((kind) => ({
      id: `test-${kind}`,
      kind: kind as "unit" | "typecheck" | "lint" | "bundle" | "still",
      description: "fixture",
    })),
  }
}

async function verifiedFixture() {
  const workspace = createQuarantineWorkspace()
  const fs = createNodePromotionFileSystem()
  fs.mkdir(join(workspace.root, "src/compositions/ClaudeCodeTutorial/scenes/custom"))
  fs.writeFile(join(workspace.root, sourcePath), Buffer.from(source))
  const harness: QuarantineVerificationHarness = {
    configPath: "harness/config.json",
    tsconfigPath: "harness/tsconfig.json",
    stillScriptPath: "harness/still.ts",
  }
  fs.mkdir(join(workspace.root, "harness"))
  for (const path of [harness.configPath, harness.tsconfigPath, harness.stillScriptPath])
    fs.writeFile(join(workspace.root, path), Buffer.from("fixture"))
  const commands: QuarantineCommand[] = (["format", "typecheck", "lint", "bundle", "still"] as const).map((stage) => ({
    stage,
    executable: "fixture",
    args: [stage],
    inputPaths: [],
    outputPaths: stage === "still" ? ["artifacts/stills"] : [],
    timeoutMs: 1000,
    maxOutputBytes: 10_000,
    requireOutputs: stage === "still",
  }))
  const job = createQuarantineJob({
    candidateManifest: manifest(),
    verificationHarness: harness,
    workspace,
    commandPlan: commands,
  })
  const result = await runQuarantineVerification(job, async (spec) => {
    if (spec.args[0] === "still") {
      mkdirSync(join(spec.cwd, "artifacts/stills"), { recursive: true })
      writeFileSync(join(spec.cwd, "artifacts/stills/scene-0.png"), Buffer.from("png"))
      return {
        exitCode: 0,
        signal: null,
        stdout: JSON.stringify({ scenes: [{ index: 0, path: "artifacts/stills/scene-0.png", frameNumber: 0 }] }),
        stderr: "",
        durationMs: 1,
        timedOut: false,
        outputCapped: false,
      }
    }
    return { exitCode: 0, signal: null, stdout: "", stderr: "", durationMs: 1, timedOut: false, outputCapped: false }
  })
  const registryOutputs = Object.fromEntries(registryPaths.map((path) => [path, `whole-file:${path}\n`]))
  const databasePath = join(workspace.root, "promotion.db")
  const database = new Database(databasePath)
  const journal = new CandidatePromotionJournal(database)
  registerCandidateVerification({
    journal,
    threadId: "thread-test",
    artifactId: "verifier-test",
    artifactVersion: 1,
    artifactHash: hashCanonicalPromotionValue(result),
    candidateManifest: manifest(),
    quarantineResult: result,
  })
  return { workspace, fs, result, manifest: manifest(), source, registryOutputs, databasePath, database, journal }
}

test("requires a separate durable candidate-promotion checkpoint", async () => {
  const fixture = await verifiedFixture()
  try {
    let plan = createCandidatePromotionPlan({
      journal: fixture.journal,
      threadId: "thread-test",
      projectRoot: fixture.workspace.root,
      candidateManifest: fixture.manifest,
      quarantineResult: fixture.result,
      sourceFiles: { [sourcePath]: fixture.source },
      registryOutputs: fixture.registryOutputs,
      filesystem: fixture.fs,
    })
    fixture.database.close()
    fixture.database = new Database(fixture.databasePath)
    fixture.journal = new CandidatePromotionJournal(fixture.database)
    plan = fixture.journal.getPlan(plan.planDigest)
    const checkpoint = createCandidatePromotionCheckpoint({ journal: fixture.journal, plan })
    assert.throws(
      () =>
        promoteCandidate({
          journal: fixture.journal,
          plan,
          checkpoint,
          approval: {
            approved: true,
            checkpointId: fixture.manifest.capability.checkpointId,
            checkpointVersion: 1,
            planDigest: plan.planDigest,
            verificationEvidenceDigest: plan.verificationEvidenceDigest,
            type: "candidate_promotion_approval",
          },
          filesystem: fixture.fs,
        }),
      /stale|malformed|different/,
    )
    assert.ok(
      createCandidatePromotionApproval(fixture.journal, checkpoint, {
        type: "candidate_promotion_approval",
        approved: true,
      }),
    )
  } finally {
    fixture.database.close()
    cleanupQuarantineWorkspace(fixture.workspace)
  }
})

test("restores every preimage after an injected mid-commit failure and rejects drifted rollback", async () => {
  const fixture = await verifiedFixture()
  try {
    const oldSource = "old source"
    fixture.fs.writeFile(join(fixture.workspace.root, sourcePath), Buffer.from(oldSource))
    fixture.fs.writeFile(join(fixture.workspace.root, registryPaths[0]), Buffer.from("old registry"))
    const plan = createCandidatePromotionPlan({
      journal: fixture.journal,
      threadId: "thread-test",
      projectRoot: fixture.workspace.root,
      candidateManifest: fixture.manifest,
      quarantineResult: fixture.result,
      sourceFiles: { [sourcePath]: fixture.source },
      registryOutputs: fixture.registryOutputs,
      filesystem: fixture.fs,
    })
    const checkpoint = createCandidatePromotionCheckpoint({ journal: fixture.journal, plan })
    const approval = createCandidatePromotionApproval(fixture.journal, checkpoint, {
      type: "candidate_promotion_approval",
      approved: true,
    })
    let renameCount = 0
    const failing: PromotionFileSystem = {
      ...fixture.fs,
      rename: (from, to) => {
        if (++renameCount === 2) throw new Error("injected rename failure")
        fixture.fs.rename(from, to)
      },
    }
    assert.throws(
      () => promoteCandidate({ journal: fixture.journal, plan, checkpoint, approval, filesystem: failing }),
      /injected rename failure/,
    )
    assert.equal(Buffer.from(fixture.fs.readFile(join(fixture.workspace.root, sourcePath))).toString(), oldSource)
    assert.equal(fixture.journal.state(plan.planDigest), "approved")

    const promotion = promoteCandidate({ journal: fixture.journal, plan, checkpoint, approval, filesystem: fixture.fs })
    fixture.fs.writeFile(join(fixture.workspace.root, sourcePath), Buffer.from("drift"))
    assert.throws(
      () =>
        rollbackCandidatePromotion({
          journal: fixture.journal,
          handle: promotion.rollbackHandle,
          filesystem: fixture.fs,
        }),
      /drift|manual intervention/,
    )
    assert.equal(fixture.journal.state(plan.planDigest), "manual_intervention")
  } finally {
    fixture.database.close()
    cleanupQuarantineWorkspace(fixture.workspace)
  }
})

test("rehydrates committed rollback authority after restart", async () => {
  const fixture = await verifiedFixture()
  try {
    for (const path of [sourcePath, ...registryPaths]) {
      fixture.fs.mkdir(join(fixture.workspace.root, path, ".."))
      fixture.fs.writeFile(join(fixture.workspace.root, path), Buffer.from(`before:${path}`))
    }
    const plan = createCandidatePromotionPlan({
      journal: fixture.journal,
      threadId: "thread-test",
      projectRoot: fixture.workspace.root,
      candidateManifest: fixture.manifest,
      quarantineResult: fixture.result,
      sourceFiles: { [sourcePath]: fixture.source },
      registryOutputs: fixture.registryOutputs,
      filesystem: fixture.fs,
    })
    const checkpoint = createCandidatePromotionCheckpoint({ journal: fixture.journal, plan })
    const approval = createCandidatePromotionApproval(fixture.journal, checkpoint, {
      type: "candidate_promotion_approval",
      approved: true,
    })
    const promotion = promoteCandidate({ journal: fixture.journal, plan, checkpoint, approval, filesystem: fixture.fs })
    fixture.database.close()
    fixture.database = new Database(fixture.databasePath)
    fixture.journal = new CandidatePromotionJournal(fixture.database)
    const rolledBack = rollbackCandidatePromotion({
      journal: fixture.journal,
      handle: promotion.rollbackHandle,
      filesystem: fixture.fs,
    })
    assert.equal(rolledBack.rolledBack, true)
    for (const path of [sourcePath, ...registryPaths]) {
      assert.equal(Buffer.from(fixture.fs.readFile(join(fixture.workspace.root, path))).toString(), `before:${path}`)
    }
  } finally {
    fixture.database.close()
    cleanupQuarantineWorkspace(fixture.workspace)
  }
})

test("recovers all-after commits and refuses unknown crash-window drift", async () => {
  const allAfter = await verifiedFixture()
  try {
    allAfter.fs.writeFile(join(allAfter.workspace.root, sourcePath), Buffer.from("before source"))
    const plan = createCandidatePromotionPlan({
      journal: allAfter.journal,
      threadId: "thread-test",
      projectRoot: allAfter.workspace.root,
      candidateManifest: allAfter.manifest,
      quarantineResult: allAfter.result,
      sourceFiles: { [sourcePath]: allAfter.source },
      registryOutputs: allAfter.registryOutputs,
      filesystem: allAfter.fs,
    })
    const checkpoint = createCandidatePromotionCheckpoint({ journal: allAfter.journal, plan })
    createCandidatePromotionApproval(allAfter.journal, checkpoint, {
      type: "candidate_promotion_approval",
      approved: true,
    })
    for (const file of allAfter.journal.files(plan.planDigest)) {
      allAfter.fs.mkdir(join(allAfter.workspace.root, file.path, ".."))
      allAfter.fs.writeFile(join(allAfter.workspace.root, file.path), file.after_bytes)
    }
    const stageDirectory = join(allAfter.workspace.root, ".candidate-promotion-00000000-0000-4000-8000-000000000001")
    allAfter.journal.db
      .prepare("UPDATE candidate_promotions SET state='committing', stage_directory=? WHERE plan_digest=?")
      .run(stageDirectory, plan.planDigest)
    allAfter.database.close()
    allAfter.database = new Database(allAfter.databasePath)
    allAfter.journal = new CandidatePromotionJournal(allAfter.database)
    assert.deepEqual(recoverCandidatePromotions(allAfter.journal, allAfter.fs), [
      { planDigest: plan.planDigest, state: "committed" },
    ])
    const row = allAfter.journal.readPromotion(plan.planDigest)
    assert.ok(row.rollback_handle_id)
  } finally {
    allAfter.database.close()
    cleanupQuarantineWorkspace(allAfter.workspace)
  }

  const drift = await verifiedFixture()
  try {
    drift.fs.writeFile(join(drift.workspace.root, sourcePath), Buffer.from("before source"))
    const plan = createCandidatePromotionPlan({
      journal: drift.journal,
      threadId: "thread-test",
      projectRoot: drift.workspace.root,
      candidateManifest: drift.manifest,
      quarantineResult: drift.result,
      sourceFiles: { [sourcePath]: drift.source },
      registryOutputs: drift.registryOutputs,
      filesystem: drift.fs,
    })
    const checkpoint = createCandidatePromotionCheckpoint({ journal: drift.journal, plan })
    createCandidatePromotionApproval(drift.journal, checkpoint, {
      type: "candidate_promotion_approval",
      approved: true,
    })
    drift.fs.writeFile(join(drift.workspace.root, sourcePath), Buffer.from("unknown external drift"))
    const stageDirectory = join(drift.workspace.root, ".candidate-promotion-00000000-0000-4000-8000-000000000002")
    drift.journal.db
      .prepare("UPDATE candidate_promotions SET state='committing', stage_directory=? WHERE plan_digest=?")
      .run(stageDirectory, plan.planDigest)
    assert.deepEqual(recoverCandidatePromotions(drift.journal, drift.fs), [
      { planDigest: plan.planDigest, state: "manual_intervention" },
    ])
    assert.equal(
      Buffer.from(drift.fs.readFile(join(drift.workspace.root, sourcePath))).toString(),
      "unknown external drift",
    )
  } finally {
    drift.database.close()
    cleanupQuarantineWorkspace(drift.workspace)
  }
})

test("rejects future migration markers and corrupt durable plan JSON", async () => {
  const future = createQuarantineWorkspace()
  const futurePath = join(future.root, "future.db")
  const database = new Database(futurePath)
  database.exec(
    "CREATE TABLE candidate_promotion_schema (singleton INTEGER PRIMARY KEY, version INTEGER NOT NULL, applied_at TEXT NOT NULL); INSERT INTO candidate_promotion_schema VALUES(1,2,'now')",
  )
  assert.throws(() => new CandidatePromotionJournal(database), /newer than supported/)
  database.close()
  cleanupQuarantineWorkspace(future)

  const fixture = await verifiedFixture()
  try {
    const plan = createCandidatePromotionPlan({
      journal: fixture.journal,
      threadId: "thread-test",
      projectRoot: fixture.workspace.root,
      candidateManifest: fixture.manifest,
      quarantineResult: fixture.result,
      sourceFiles: { [sourcePath]: fixture.source },
      registryOutputs: fixture.registryOutputs,
      filesystem: fixture.fs,
    })
    fixture.journal.db.prepare("UPDATE candidate_promotions SET plan_json='{' WHERE plan_digest=?").run(plan.planDigest)
    assert.throws(() => fixture.journal.state(plan.planDigest), /Corrupt plan .* JSON/)
  } finally {
    fixture.database.close()
    cleanupQuarantineWorkspace(fixture.workspace)
  }
})

test("serializes competing parent claims across SQLite connections", async () => {
  const fixture = await verifiedFixture()
  const secondDatabase = new Database(fixture.databasePath)
  secondDatabase.pragma("busy_timeout = 1")
  const secondJournal = new CandidatePromotionJournal(secondDatabase)
  try {
    fixture.database.exec("BEGIN IMMEDIATE")
    assert.throws(() => secondJournal.immediate(() => secondJournal.db.prepare("SELECT 1").get()), /database is locked/)
    fixture.database.exec("ROLLBACK")
  } finally {
    if (fixture.database.inTransaction) fixture.database.exec("ROLLBACK")
    secondDatabase.close()
    fixture.database.close()
    cleanupQuarantineWorkspace(fixture.workspace)
  }
})

test("does not accept unregistered verifier evidence", () => {
  const workspace = createQuarantineWorkspace()
  const database = new Database(":memory:")
  try {
    assert.throws(
      () =>
        createCandidatePromotionPlan({
          journal: new CandidatePromotionJournal(database),
          threadId: "thread-test",
          projectRoot: workspace.root,
          candidateManifest: manifest(),
          quarantineResult: {} as never,
          sourceFiles: { [sourcePath]: source },
          registryOutputs: Object.fromEntries(registryPaths.map((path) => [path, "x"])),
          filesystem: createNodePromotionFileSystem(),
        }),
      /registered|evidence/,
    )
  } finally {
    database.close()
    cleanupQuarantineWorkspace(workspace)
  }
})
