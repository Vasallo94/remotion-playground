import { describe, it, before, after } from "node:test"
import assert from "node:assert"
import { app } from "../src/server.js"
import { insertJob } from "../src/db.js"
import type { Server } from "http"

let server: Server
const BASE = "http://localhost:3199"

before(() => {
  server = app.listen(3199)
})

after(() => {
  server.close()
})

describe("POST /api/validate", () => {
  it("returns valid:true for a correct config", async () => {
    const config = {
      id: "test-video",
      title: "Test",
      description: "A test video",
      fps: 30,
      width: 1280,
      height: 720,
      theme: "linea-directa",
      scenes: [{ type: "intro", title: "Hello", durationInSeconds: 3 }],
    }
    const res = await fetch(`${BASE}/api/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    })
    assert.strictEqual(res.status, 200)
    const body = await res.json()
    assert.strictEqual(body.valid, true)
  })

  it("returns valid:false for an invalid config", async () => {
    const res = await fetch(`${BASE}/api/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bad: true }),
    })
    assert.strictEqual(res.status, 400)
    const body = await res.json()
    assert.strictEqual(body.valid, false)
    assert(Array.isArray(body.errors))
  })
})

describe("POST /api/render idempotency", () => {
  it("reuses one existing job and rejects changed input", async () => {
    const suffix = Date.now().toString()
    const key = `render:test:${suffix}`
    const hash = "a".repeat(64)
    const id = `idempotent-render-${suffix}`
    insertJob({ id, config_id: "idempotent", idempotency_key: key, request_hash: hash })
    const reused = await fetch(`${BASE}/api/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key, "X-Claqueta-Request-Hash": hash },
      body: JSON.stringify({ id: "does-not-spawn" }),
    })
    assert.equal(reused.status, 200)
    assert.deepEqual(await reused.json(), { jobId: id, reused: true, status: "validating" })

    const conflict = await fetch(`${BASE}/api/render`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
        "X-Claqueta-Request-Hash": "b".repeat(64),
      },
      body: JSON.stringify({ id: "changed" }),
    })
    assert.equal(conflict.status, 409)
  })
})

describe("GET /api/render/:id/status", () => {
  it("returns 404 for unknown job", async () => {
    const res = await fetch(`${BASE}/api/render/nonexistent/status`)
    assert.strictEqual(res.status, 404)
  })
})

describe("GET /api/render/:id/review", () => {
  it("rejects unknown jobs", async () => {
    const res = await fetch(`${BASE}/api/render/unknown-review-job/review`)
    assert.equal(res.status, 404)
  })

  it("rejects incomplete jobs", async () => {
    const id = `incomplete-review-${Date.now()}`
    insertJob({ id, config_id: "incomplete", title: "Incomplete", composition: "ClaudeCodeTutorial" })
    const res = await fetch(`${BASE}/api/render/${id}/review`)
    assert.equal(res.status, 409)
  })
})

describe("GET /api/render/:id/stream", () => {
  it("returns 404 for unknown job", async () => {
    const res = await fetch(`${BASE}/api/render/nonexistent/stream`)
    assert.strictEqual(res.status, 404)
  })
})

describe("GET /api/audio/library", () => {
  it("returns a list of tracks", async () => {
    const res = await fetch(`${BASE}/api/audio/library`)
    assert.strictEqual(res.status, 200)
    const body = await res.json()
    assert(Array.isArray(body.tracks))
  })
})

describe("GET /api/render/jobs?config_id=", () => {
  it("returns empty array for unknown config_id", async () => {
    const res = await fetch(`${BASE}/api/render/jobs?config_id=nonexistent`)
    assert.strictEqual(res.status, 200)
    const body = await res.json()
    assert(Array.isArray(body.jobs))
    assert.strictEqual(body.jobs.length, 0)
  })
})

describe("GET /api/configs", () => {
  it("returns selectable configs", async () => {
    const res = await fetch(`${BASE}/api/configs`)
    assert.strictEqual(res.status, 200)
    const body = await res.json()
    assert(Array.isArray(body.configs))
    assert(body.configs.some((config: { configPath?: string }) => config.configPath?.endsWith("config.json")))
  })
})
