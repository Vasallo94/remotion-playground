import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { evaluateCandidatePolicy } from "../src/candidatePolicy.js"
import type { ExecutableSceneCandidateDraft } from "../src/executableSceneCandidate.js"
import { buildCandidateManifest, buildCandidateRegistryOutputs } from "../src/tier2Pipeline.js"
import { PROJECT_ROOT } from "../src/paths.js"

const source = `import { type FC } from "react"
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion"

export interface CascadeNetworkProps {
  title: string
  progress: number
}

export const CascadeNetworkScene: FC<Record<string, unknown>> = (input) => {
  const frame = useCurrentFrame()
  const props = input as unknown as CascadeNetworkProps
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  return <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity }}><div>{props.title}: {props.progress}</div></AbsoluteFill>
}
`

function draft(): ExecutableSceneCandidateDraft {
  return {
    componentId: "cascade-network",
    exportName: "CascadeNetworkScene",
    source,
    exampleProps: { title: "Network", progress: 50 },
    sceneProps: { scene_2: { title: "Propagation", progress: 80 } },
    propContract: "interface CascadeNetworkProps { title: string; progress: number }",
    visualReadyMs: 150,
    catalog: {
      description: "Deterministic connected-node state simulation.",
      narrativeRoles: ["simulation", "explanation"],
      bestFor: ["propagation through connected systems"],
      avoidWhen: ["the relationship is purely linear"],
      textLimits: { maxVisibleWords: 20, maxWordsPerSecond: 3 },
      durationRange: [5, 15],
      recommendedBeats: 3,
      placement: ["middle"],
      exampleUse: "Show state propagation and a containment boundary.",
    },
  }
}

describe("Tier 2 runtime package construction", () => {
  it("binds generated source to exact CP4 lineage and passes static policy", () => {
    const candidate = draft()
    const manifest = buildCandidateManifest({
      draft: candidate,
      proposalId: "proposal-cascade",
      checkpointId: "cp4-cascade",
      checkpointVersion: 1,
      approvalDigest: "a".repeat(64),
    })
    const report = evaluateCandidatePolicy(manifest, { [manifest.sourceFiles[0]!.path]: source })
    assert.equal(report.valid, true, JSON.stringify(report.findings, null, 2))
    assert.equal(manifest.component.id, "cascade-network")
    assert.equal(manifest.capability.checkpointId, "cp4-cascade")
  })

  it("produces exact whole-file registry, timing, and catalog outputs without writing production", () => {
    const outputs = buildCandidateRegistryOutputs(draft(), PROJECT_ROOT)
    assert.deepEqual(Object.keys(outputs).sort(), [
      "src/compositions/ClaudeCodeTutorial/customSceneRegistry.ts",
      "src/shared/scene-catalog.json",
      "src/shared/sceneTimingRegistry.ts",
    ])
    assert.match(outputs["src/compositions/ClaudeCodeTutorial/customSceneRegistry.ts"]!, /CascadeNetworkScene/)
    assert.match(outputs["src/shared/sceneTimingRegistry.ts"]!, /"cascade-network"/)
    const catalog = JSON.parse(outputs["src/shared/scene-catalog.json"]!) as {
      scenes: { tutorial: { custom: Array<{ componentId: string }> } }
    }
    assert.equal(catalog.scenes.tutorial.custom.filter((entry) => entry.componentId === "cascade-network").length, 1)
  })
})
