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
    let returnedPath = png
    const server = createServer((_request, response) => {
      response.setHeader("content-type", "application/json")
      response.end(JSON.stringify({ scenes: [{ index: 0, path: returnedPath, frameNumber: 42 }] }))
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    assert(address && typeof address !== "string")
    const client = new SceneStillClient(`http://127.0.0.1:${address.port}`, jobsRoot)
    const stills = await client.render({ scenes: [{}] }, 1)
    assert.equal(stills[0]?.image.mimeType, "image/png")

    const outside = join(project, "outside.png")
    writeFileSync(outside, "png")
    returnedPath = outside
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
    const session: SceneQaSession = {
      subscribe() {
        return () => undefined
      },
      async prompt(_text, options) {
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
          frameNumber: 54,
          image: { type: "image", data: "cG5n", mimeType: "image/png" },
        },
      ],
    })
    assert.equal(result.modelRoute, "google/qa-test")
    assert.equal(imageCount, 1)
    assert.equal(disposed, true)
    store.close()
  })
})
