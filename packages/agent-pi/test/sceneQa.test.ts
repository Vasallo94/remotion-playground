import assert from "node:assert/strict"
import { createServer } from "node:http"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, it } from "node:test"
import { ThreadEventBus } from "../src/events.js"
import { ModelRouter } from "../src/modelRouter.js"
import { SceneQaRunner, SceneStillClient, validateSceneQaReport, type SceneQaSession } from "../src/sceneQa.js"
import { AgentPiStore } from "../src/store.js"
import { cleanupTestDirectory, createTestTemporaryDirectory } from "../src/testCleanup.js"
import type { SceneQaReport } from "../src/types.js"

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach(cleanupTestDirectory))

const passReport: SceneQaReport = {
  summary: "The rendered scene is legible and coherent.",
  scenes: [{ index: 0, verdict: "PASS", score: 9, observations: ["Central text is fully visible"], issues: [] }],
}

describe("Scene QA", () => {
  it("validates exact ordered coverage and issue evidence", () => {
    assert.deepEqual(validateSceneQaReport(passReport, 1), passReport)
    assert.throws(() => validateSceneQaReport({ ...passReport, scenes: [] }, 1), /every scene/)
    assert.throws(
      () =>
        validateSceneQaReport(
          { summary: "bad", scenes: [{ index: 0, verdict: "MINOR_FIX", score: 6, observations: [], issues: [] }] },
          1,
        ),
      /requires issues/,
    )
  })

  it("accepts only complete PNG manifests beneath the jobs root", async () => {
    const project = createTestTemporaryDirectory("claqueta-stills-")
    dirs.push(project)
    const jobsRoot = join(project, "jobs")
    mkdirSync(jobsRoot)
    const png = join(jobsRoot, "scene-0.png")
    writeFileSync(png, "png")
    let manifest: Record<string, unknown> = { scenes: [{ index: 0, path: png, frameNumber: 42 }] }
    const server = createServer((_request, response) => {
      response.setHeader("content-type", "application/json")
      response.end(JSON.stringify(manifest))
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    assert(address && typeof address !== "string")
    const client = new SceneStillClient(`http://127.0.0.1:${address.port}`, jobsRoot)
    const stills = await client.render({ scenes: [{}] }, 1)
    assert.equal(stills[0]?.image.mimeType, "image/png")

    const boundary0 = join(jobsRoot, "scene-0-evidence-0.png")
    const boundary1 = join(jobsRoot, "scene-0-evidence-1.png")
    writeFileSync(boundary0, "png")
    writeFileSync(boundary1, "png")
    manifest = {
      scenes: [{ index: 0, path: png, frameNumber: 42 }],
      evidence: [
        { index: 0, evidenceIndex: 0, atMs: 0, path: boundary0, frameNumber: 0 },
        { index: 0, evidenceIndex: 1, atMs: 1000, path: boundary1, frameNumber: 30 },
      ],
    }
    const evidence = await client.render(
      {
        scenes: [
          {
            componentId: "visual-program",
            props: { compiled: { timeline: [{ atMs: 0 }, { atMs: 1000 }] } },
          },
        ],
      },
      1,
    )
    assert.deepEqual(
      evidence.map((still) => [still.evidenceIndex, still.atMs, still.frameNumber]),
      [
        [0, 0, 0],
        [1, 1000, 30],
      ],
    )
    manifest = {
      scenes: [{ index: 0, path: png, frameNumber: 42 }],
      evidence: [{ index: 0, evidenceIndex: 0, atMs: 0, path: boundary0, frameNumber: 0 }],
    }
    await assert.rejects(
      client.render(
        {
          scenes: [
            {
              componentId: "visual-program",
              props: { compiled: { timeline: [{ atMs: 0 }, { atMs: 1000 }] } },
            },
          ],
        },
        1,
      ),
      /every ordered Visual Program boundary/,
    )

    const outside = join(project, "outside.png")
    writeFileSync(outside, "png")
    manifest = { scenes: [{ index: 0, path: outside, frameNumber: 42 }] }
    await assert.rejects(client.render({ scenes: [{}] }, 1), /escapes render jobs root/)
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  })

  it("repairs one missing structured output turn", async () => {
    const dir = createTestTemporaryDirectory("claqueta-scene-qa-repair-")
    dirs.push(dir)
    const store = new AgentPiStore(join(dir, "qa.db"))
    const threadId = store.createThread().id
    const modelRouter = new ModelRouter({ routes: {} })
    let prompts = 0
    const runner = new SceneQaRunner({
      threadId,
      eventBus: new ThreadEventBus(store),
      modelRouter,
      authStorage: modelRouter.authStorage,
      modelRegistry: modelRouter.modelRegistry,
      createSession: async (capture) => ({
        subscribe() {
          return () => undefined
        },
        async prompt() {
          prompts += 1
          if (prompts === 2) capture(passReport)
        },
        async abort() {},
        dispose() {},
      }),
    })
    await runner.run({
      config: { scenes: [{}] },
      script: { title: "Repair", objective: "Test", scenes: [{ id: "s1", type: "intro", durationInSeconds: 3 }] },
      direction: { scenes: [], warnings: [] },
      stills: [
        { index: 0, path: "/safe.png", frameNumber: 1, image: { type: "image", data: "cG5n", mimeType: "image/png" } },
      ],
    })
    assert.equal(prompts, 2)
    store.close()
  })

  it("runs in an isolated image-capable session and disposes it", async () => {
    const dir = createTestTemporaryDirectory("claqueta-scene-qa-")
    dirs.push(dir)
    const store = new AgentPiStore(join(dir, "qa.db"))
    const threadId = store.createThread().id
    const modelRouter = new ModelRouter({ routes: { scene_qa: { provider: "google", model: "qa-test" } } })
    let disposed = false
    let imageCount = 0
    let promptText = ""
    const session: SceneQaSession = {
      subscribe() {
        return () => undefined
      },
      async prompt(text, options) {
        promptText = text
        imageCount += options?.images?.length ?? 0
      },
      async abort() {},
      dispose() {
        disposed = true
      },
    }
    const runner = new SceneQaRunner({
      threadId,
      eventBus: new ThreadEventBus(store),
      modelRouter,
      authStorage: modelRouter.authStorage,
      modelRegistry: modelRouter.modelRegistry,
      createSession: async (capture) => {
        capture(passReport)
        return session
      },
    })
    const result = await runner.run({
      config: { id: "visual-story", scenes: [{ type: "intro" }] },
      script: { title: "Historia", objective: "Informar", scenes: [{ id: "s1", type: "intro", durationInSeconds: 3 }] },
      direction: {
        scenes: [
          {
            sceneId: "s1",
            sceneType: "intro",
            technicalIntent: "Open",
            visualContract: "Title",
            timing: {},
            beats: [],
            assets: [],
            risks: [],
          },
        ],
        warnings: [],
      },
      stills: [
        {
          index: 0,
          path: "/safe/scene-0.png",
          frameNumber: 0,
          evidenceIndex: 0,
          atMs: 0,
          image: { type: "image", data: "cG5n", mimeType: "image/png" },
        },
        {
          index: 0,
          path: "/safe/scene-0-evidence-1.png",
          frameNumber: 30,
          evidenceIndex: 1,
          atMs: 1000,
          image: { type: "image", data: "cG5n", mimeType: "image/png" },
        },
      ],
    })
    assert.equal(result.modelRoute, "google/qa-test")
    assert.equal(imageCount, 2)
    assert.match(promptText, /scene 0, ordered boundary 1, at 1000ms, frame 30/)
    assert.equal(disposed, true)
    store.close()
  })
})
