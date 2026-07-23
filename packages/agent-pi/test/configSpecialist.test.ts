import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import {
  ConfigSpecialistRunner,
  configContentHash,
  validateGeneratedConfig,
  type ApprovedConfigInputArtifact,
  type ConfigSpecialistInput,
  type ConfigSpecialistSession,
} from "../src/configSpecialist.js"
import { PROJECT_ROOT } from "../src/paths.js"
import { buildProductionBriefArtifact, type ProductionBriefCandidate } from "../src/productionBrief.js"
import { REGISTERED_TARGETS, summarizeTargetContract } from "../src/targetContracts.js"
import type { AudioChart, DirectionDraft, ScriptDraft } from "../src/types.js"

const provided = <T>(value: T) => ({ status: "provided" as const, value, source: "human_review" as const })
const absent = (rationale: string) => ({ status: "explicitly_absent" as const, rationale })

function productionBrief(): ApprovedConfigInputArtifact<ReturnType<typeof buildProductionBriefArtifact>> {
  const candidate: ProductionBriefCandidate = {
    subject: provided("An approved subject"),
    objective: provided("Explain the approved material"),
    audience: provided("The approved audience"),
    language: provided("The approved language"),
    platform: provided("The approved destination"),
    format: provided("video/mp4"),
    dimensions: provided({ width: 1280, height: 720, unit: "px" }),
    aspectRatio: provided("16:9"),
    duration: provided({ seconds: 7 }),
    brand: absent("No brand is required."),
    tone: absent("No tone was requested."),
    evidence: provided({ claims: [], sourceReferences: [], externalVerification: "not_required" }),
    assets: absent("No assets are required."),
    constraints: absent("No additional constraints were approved."),
    audioPreferences: absent("No audio preference was approved."),
    targetRequirements: provided([{ name: "target", requirement: "Use the explicitly selected target." }]),
    acceptanceCriteria: provided(["Preserve the approved copy."]),
    researchRequirement: provided("not_required"),
    researchRationale: provided("No external claims require verification."),
  }
  return { artifactId: "brief-1", version: 1, approved: true, data: buildProductionBriefArtifact(candidate) }
}

const script: ScriptDraft = {
  title: "Approved production title",
  objective: "Explain the approved material",
  scenes: [
    {
      id: "scene-1",
      type: "intro",
      title: "Approved opening",
      propsPlan: { title: "Approved opening", subtitle: "Approved subtitle" },
      durationInSeconds: 3,
    },
    {
      id: "scene-2",
      type: "outro",
      title: "Approved close",
      propsPlan: { title: "Approved close", bullets: ["Approved takeaway"] },
      durationInSeconds: 4,
    },
  ],
}
const direction: DirectionDraft = {
  scenes: [
    { sceneId: "scene-1", sceneType: "intro", timing: { tailHoldMs: 0 }, beats: [] },
    { sceneId: "scene-2", sceneType: "outro", timing: { tailHoldMs: 0 }, beats: [] },
  ],
  warnings: [],
}

const approved = <T>(artifactId: string, data: T): ApprovedConfigInputArtifact<T> => ({
  artifactId,
  version: 1,
  approved: true,
  data,
})

function validConfig(): Record<string, unknown> {
  return {
    id: "approved-production",
    title: "Approved production title",
    description: "Approved objective",
    composition: "ClaudeCodeTutorial",
    theme: "claqueta",
    fps: 30,
    width: 1280,
    height: 720,
    scenes: [
      {
        type: "intro",
        title: "Approved opening",
        subtitle: "Approved subtitle",
        durationInSeconds: 3,
        timing: { tailHoldMs: 0 },
        beats: [],
      },
      {
        type: "outro",
        title: "Approved close",
        bullets: ["Approved takeaway"],
        durationInSeconds: 4,
        timing: { tailHoldMs: 0 },
        beats: [],
      },
    ],
    transition: null,
  }
}

function input(overrides: Partial<ConfigSpecialistInput> = {}): ConfigSpecialistInput {
  return {
    productionBrief: productionBrief(),
    target: summarizeTargetContract(REGISTERED_TARGETS.targets[0]!),
    script: approved("script-1", structuredClone(script)),
    direction: approved("direction-1", structuredClone(direction)),
    previousConfig: null,
    ...overrides,
  }
}

function fakeRouter() {
  return { findModel: () => undefined, route: () => ({ provider: "test", model: "config" }) } as never
}

function runnerWithResponses(responses: Array<Record<string, unknown> | undefined>) {
  const state = { prompts: [] as string[], disposed: false, sessionCreated: false }
  const runner = new ConfigSpecialistRunner({
    threadId: "thread",
    eventBus: { publish: () => undefined } as never,
    modelRouter: fakeRouter(),
    authStorage: {} as never,
    modelRegistry: {} as never,
    createSession: async (capture): Promise<ConfigSpecialistSession> => {
      state.sessionCreated = true
      return {
        subscribe: () => () => undefined,
        prompt: async (text) => {
          state.prompts.push(text)
          const response = responses[state.prompts.length - 1]
          if (response) capture(response)
        },
        abort: async () => undefined,
        dispose: () => {
          state.disposed = true
        },
      }
    },
  })
  return { runner, state }
}

const silentAudio: AudioChart = {
  voiceover: null,
  soundDesign: { enabled: false, musicBed: null, sfx: [] },
  warnings: [],
}

describe("ConfigSpecialistRunner", () => {
  it("rejects config outside the minimum output contract", () => {
    assert.throws(() => validateGeneratedConfig({ id: "bad", scenes: [] }), /scenes/)
  })

  it("requires approved prerequisites and exactly one unmodified resolved target summary", async () => {
    const missingPrevious = runnerWithResponses([validConfig()])
    const withoutPrevious = { ...input() } as Partial<ConfigSpecialistInput>
    delete withoutPrevious.previousConfig
    await assert.rejects(
      () => missingPrevious.runner.run(withoutPrevious as ConfigSpecialistInput),
      /must be explicitly null for first generation/,
    )
    assert.equal(missingPrevious.state.sessionCreated, false)

    const missingApproval = input({ script: { ...approved("script-1", script), approved: false } as never })
    const first = runnerWithResponses([validConfig()])
    await assert.rejects(() => first.runner.run(missingApproval), /Script artifact must be approved/)
    assert.equal(first.state.sessionCreated, false)

    const tamperedTarget = structuredClone(input().target)
    tamperedTarget.capabilities.themes = ["invented-theme"]
    const second = runnerWithResponses([validConfig()])
    await assert.rejects(
      () => second.runner.run(input({ target: tamperedTarget })),
      /does not match the parent registry/,
    )
    assert.equal(second.state.sessionCreated, false)
  })

  it("rejects malformed approved script and direction data before specialist execution", async () => {
    const malformedScript = runnerWithResponses([validConfig()])
    await assert.rejects(
      () => malformedScript.runner.run(input({ script: approved("script-bad", { title: "Bad" } as never) })),
      /Script artifact data must contain a scenes array/,
    )
    assert.equal(malformedScript.state.sessionCreated, false)

    const malformedDirection = runnerWithResponses([validConfig()])
    await assert.rejects(
      () => malformedDirection.runner.run(input({ direction: approved("direction-bad", { scenes: null } as never) })),
      /Direction artifact data must contain a scenes array/,
    )
    assert.equal(malformedDirection.state.sessionCreated, false)
  })

  it("rejects a wrong target and unsupported brief capabilities before specialist execution", async () => {
    const wrongTarget = summarizeTargetContract(REGISTERED_TARGETS.targets[2]!)
    const wrong = runnerWithResponses([validConfig()])
    await assert.rejects(() => wrong.runner.run(input({ target: wrongTarget })), /dimensions are not supported/)
    assert.equal(wrong.state.sessionCreated, false)

    const brief = productionBrief()
    brief.data.brief.format = provided("unsupported/format")
    const unsupported = runnerWithResponses([validConfig()])
    await assert.rejects(
      () => unsupported.runner.run(input({ productionBrief: brief })),
      /format is not supported by the selected target/,
    )
    assert.equal(unsupported.state.sessionCreated, false)
  })

  it("enforces composition, dimensions, theme, and fps capabilities", async () => {
    const bad = validConfig()
    bad.composition = "ProductShort"
    const { runner, state } = runnerWithResponses([bad, bad])
    await assert.rejects(() => runner.run(input()), /failed after one repair turn/)
    assert.match(state.prompts[1]!, /composition/)
    assert.equal(state.prompts.length, 2)
  })

  it("enforces an explicit target theme from the approved brief", async () => {
    const brief = productionBrief()
    brief.data.brief.targetRequirements = provided([
      { name: "target.id", requirement: "target.video.001" },
      { name: "target.theme", requirement: "atom-dark" },
    ])
    const wrongTheme = validConfig()
    const { runner, state } = runnerWithResponses([wrongTheme, wrongTheme])
    await assert.rejects(
      () => runner.run(input({ productionBrief: brief })),
      /does not match explicit target theme 'atom-dark'/,
    )
    assert.equal(state.prompts.length, 2)
  })

  it("rejects reordered and extra scenes against approved lineage", async () => {
    const reordered = validConfig()
    reordered.scenes = [...(reordered.scenes as unknown[])].reverse()
    const reorderedRun = runnerWithResponses([reordered, reordered])
    await assert.rejects(() => reorderedRun.runner.run(input()), /approved adapter|approved prop\/copy/)

    const extra = validConfig()
    extra.scenes = [...(extra.scenes as unknown[]), (extra.scenes as unknown[])[0]]
    const extraRun = runnerWithResponses([extra, extra])
    await assert.rejects(() => extraRun.runner.run(input()), /scene count 3/)
  })

  it("replaces model changes with approved visible copy", async () => {
    const changed = validConfig()
    ;(changed.scenes as Array<Record<string, unknown>>)[0]!.title = "Unapproved rewrite"
    const { runner } = runnerWithResponses([changed])
    const result = await runner.run(input())
    assert.equal((result.config.scenes as Array<Record<string, unknown>>)[0]!.title, "Approved opening")
  })

  it("rejects stale or modified previous config before specialist execution", async () => {
    const initial = runnerWithResponses([validConfig()])
    const first = await initial.runner.run(input())
    const staleInput = input({
      previousConfig: {
        artifactId: "config-1",
        version: 1,
        latestVersion: 2,
        data: first.config,
        contentHash: first.configHash,
        lineage: first.lineage,
      },
    })
    const stale = runnerWithResponses([validConfig()])
    await assert.rejects(
      () => stale.runner.run(staleInput),
      /Previous config is stale: selected version 1, latest version 2/,
    )
    assert.equal(stale.state.sessionCreated, false)

    const modifiedInput = input({
      previousConfig: {
        artifactId: "config-1",
        version: 1,
        latestVersion: 1,
        data: { ...first.config, title: "Modified after generation" },
        contentHash: first.configHash,
        lineage: first.lineage,
      },
    })
    const modified = runnerWithResponses([validConfig()])
    await assert.rejects(() => modified.runner.run(modifiedInput), /content hash does not match/)
  })

  it("projects approved audio exactly", async () => {
    const divergent = validConfig()
    divergent.voiceover = { enabled: true, provider: "gemini", language: "x", voiceId: "Orus", scenes: {} }
    divergent.soundDesign = { enabled: true, musicBed: { libraryId: "invented" }, sfx: [] }
    const { runner } = runnerWithResponses([divergent])
    const result = await runner.run(input({ audio: approved("audio-1", silentAudio) }))
    assert.deepEqual(result.config.voiceover, silentAudio.voiceover)
    assert.deepEqual(result.config.soundDesign, silentAudio.soundDesign)
  })

  it("removes model-authored audio before the audio checkpoint", async () => {
    const unapproved = validConfig()
    unapproved.voiceover = { enabled: true, provider: "gemini", scenes: {} }
    unapproved.soundDesign = { enabled: true, musicBed: null, sfx: [] }
    const { runner } = runnerWithResponses([unapproved])
    const result = await runner.run(input())
    assert.equal("voiceover" in result.config, false)
    assert.equal("soundDesign" in result.config, false)
  })

  it("maps approved custom props through the real scene adapter without requiring editorial fields", async () => {
    const customScript: ScriptDraft = {
      ...script,
      scenes: [
        {
          id: "scene-custom",
          type: "custom",
          componentId: "block-diagram",
          propsPlan: { title: "Approved diagram", blocks: [{ label: "Approved", detail: "Contract data" }] },
          durationInSeconds: 4,
        },
      ],
    }
    const customDirection: DirectionDraft = {
      scenes: [
        {
          sceneId: "scene-custom",
          sceneType: "custom",
          componentId: "block-diagram",
          timing: { tailHoldMs: 0 },
          beats: [],
        },
      ],
      warnings: [],
    }
    const customConfig = {
      ...validConfig(),
      scenes: [
        {
          type: "custom",
          componentId: "block-diagram",
          props: { title: "Approved diagram", blocks: [{ label: "Approved", detail: "Contract data" }] },
          durationInSeconds: 4,
          timing: { tailHoldMs: 0 },
          beats: [],
        },
      ],
    }
    const { runner } = runnerWithResponses([customConfig])
    const result = await runner.run(
      input({
        script: approved("script-custom", customScript),
        direction: approved("direction-custom", customDirection),
      }),
    )
    assert.deepEqual(
      (result.config.scenes as Array<Record<string, unknown>>)[0]?.props,
      customScript.scenes[0]?.propsPlan,
    )
  })

  it("unwraps an approved full-scene wrapper into direct custom component props", async () => {
    const wrapped = structuredClone(script)
    wrapped.scenes = [
      {
        id: "scene-custom",
        type: "custom",
        componentId: "block-diagram",
        durationInSeconds: 4,
        propsPlan: {
          componentId: "block-diagram",
          durationInSeconds: 4,
          props: { title: "Direct props", blocks: [{ label: "A" }] },
        },
      },
    ]
    const customDirection: DirectionDraft = {
      scenes: [{ sceneId: "scene-custom", sceneType: "custom", componentId: "block-diagram", beats: [] }],
      warnings: [],
    }
    const candidate = { ...validConfig(), scenes: [{ type: "custom", componentId: "block-diagram", props: {} }] }
    const { runner } = runnerWithResponses([candidate])
    const result = await runner.run(
      input({
        script: approved("script-wrapped", wrapped),
        direction: approved("direction-wrapped", customDirection),
      }),
    )
    assert.deepEqual((result.config.scenes as Array<Record<string, unknown>>)[0]?.props, {
      title: "Direct props",
      blocks: [{ label: "A" }],
    })
  })

  it("rejects invalid previous config versions before specialist execution", async () => {
    const badVersion = runnerWithResponses([validConfig()])
    await assert.rejects(
      () =>
        badVersion.runner.run(
          input({
            previousConfig: {
              artifactId: "config-1",
              version: 0,
              latestVersion: 0,
              data: validConfig(),
              contentHash: configContentHash(validConfig()),
              lineage: {} as never,
            },
          }),
        ),
      /Previous config versions must be positive integers/,
    )
    assert.equal(badVersion.state.sessionCreated, false)
  })

  it("parent-compiles immutable script props and direction fields before validation", async () => {
    const divergent = validConfig()
    const scenes = divergent.scenes as Array<Record<string, unknown>>
    scenes[0]!.title = "Changed by model"
    scenes[0]!.subtitle = "Changed by model"
    scenes[0]!.durationInSeconds = 9
    scenes[0]!.timing = { tailHoldMs: 999 }
    scenes[0]!.beats = [{ id: "invented" }]

    const { runner, state } = runnerWithResponses([divergent])
    const result = await runner.run(input())
    const compiled = result.config.scenes as Array<Record<string, unknown>>

    assert.equal(state.prompts.length, 1)
    assert.equal(compiled[0]!.title, "Approved opening")
    assert.equal(compiled[0]!.subtitle, "Approved subtitle")
    assert.equal(compiled[0]!.durationInSeconds, 3)
    assert.deepEqual(compiled[0]!.timing, { tailHoldMs: 0 })
    assert.deepEqual(compiled[0]!.beats, [])
  })

  it("allows one exact repair turn, returns separate lineage, and disposes the session", async () => {
    const invalid = validConfig()
    invalid.width = 1080
    const repaired = validConfig()
    const { runner, state } = runnerWithResponses([invalid, repaired])
    const result = await runner.run(input())

    assert.equal(state.prompts.length, 2)
    assert.match(state.prompts[1]!, /This is the one repair turn/)
    assert.match(state.prompts[1]!, /Render schema rejected config|dimensions/)
    assert.equal(state.disposed, true)
    assert.equal(result.modelRoute, "test/config")
    assert.equal(result.lineage.target.targetId, "target.video.001")
    assert.equal(result.configHash, configContentHash(result.config))
    assert.equal("lineage" in result.config, false)
  })

  it("fails after the single repair turn and does not ask again", async () => {
    const bad = validConfig()
    bad.theme = "unsupported-theme"
    const { runner, state } = runnerWithResponses([bad, bad, validConfig()])
    await assert.rejects(() => runner.run(input()), /failed after one repair turn/)
    assert.equal(state.prompts.length, 2)
    assert.equal(state.disposed, true)
  })

  it("keeps the static role prompt free of target-level defaults", () => {
    const prompt = readFileSync(join(PROJECT_ROOT, "packages/agent-pi/resources/agents/configurator.md"), "utf-8")
    for (const forbidden of [
      "ClaudeCodeTutorial",
      "ProductShort",
      "VerticalShort",
      "1280",
      "1080",
      "betelgeuse",
      "linea-directa",
      "video/mp4",
      "Spanish",
      "Instagram",
    ]) {
      assert.equal(prompt.includes(forbidden), false, `configurator prompt hardcodes '${forbidden}'`)
    }
  })
})
