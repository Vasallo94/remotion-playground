import assert from "node:assert/strict"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, describe, it } from "node:test"
import type { AgentRuntimeManager } from "../src/session.js"
import { ThreadEventBus } from "../src/events.js"
import { AgentPiStore } from "../src/store.js"
import { createApp } from "../src/server.js"

const servers: Server[] = []
const stores: AgentPiStore[] = []

async function startServer(store: AgentPiStore): Promise<string> {
  const runtime = {
    cwd: process.cwd(),
    store,
    eventBus: new ThreadEventBus(store),
    modelRouter: { config: {} },
  } as unknown as AgentRuntimeManager
  const server = createServer(createApp(runtime))
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address() as AddressInfo
  return `http://127.0.0.1:${address.port}`
}

async function readSseIds(url: string, expectedCount: number, headers?: HeadersInit): Promise<number[]> {
  const response = await fetch(url, { headers })
  assert.equal(response.status, 200)
  assert.ok(response.body)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ""
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      text += decoder.decode(chunk.value, { stream: true })
      const ids = [...text.matchAll(/^id: t2:(\d+)$/gm)].map((match) => Number(match[1]))
      if (ids.length >= expectedCount) {
        await reader.cancel()
        return ids
      }
    }
  } finally {
    reader.releaseLock()
  }
  return [...text.matchAll(/^id: t2:(\d+)$/gm)].map((match) => Number(match[1]))
}

afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()))
  for (const store of stores.splice(0)) store.close()
})

describe("HTTP event cursors", () => {
  it("replays decimal and t2 cursors across 500-row pages", async () => {
    const store = new AgentPiStore(":memory:")
    stores.push(store)
    const thread = store.createThread({ id: "http-cursor-thread" })
    for (let index = 0; index < 1_001; index += 1) {
      store.appendEvent({ threadId: thread.id, type: "message_delta", payload: { index } })
    }
    const baseUrl = await startServer(store)

    const t2Ids = await readSseIds(`${baseUrl}/api/pi/events/${thread.id}?since=t2:500`, 501)
    assert.equal(t2Ids[0], 501)
    assert.equal(t2Ids.at(-1), 1001)

    const decimalIds = await readSseIds(`${baseUrl}/api/pi/events/${thread.id}`, 501, { "Last-Event-ID": "500" })
    assert.deepEqual(decimalIds, t2Ids)
  })

  it("rejects malformed and future HTTP cursors", async () => {
    const store = new AgentPiStore(":memory:")
    stores.push(store)
    const thread = store.createThread({ id: "http-invalid-cursor-thread" })
    store.appendEvent({ threadId: thread.id, type: "agent_end", payload: {} })
    const baseUrl = await startServer(store)

    for (const cursor of ["t2:0", "not-a-cursor", "t2:2", "999"]) {
      const response = await fetch(`${baseUrl}/api/pi/events/${thread.id}?since=${encodeURIComponent(cursor)}`)
      assert.equal(response.status, 400)
      assert.match(await response.text(), /cursor/i)
    }

    const repeated = await fetch(`${baseUrl}/api/pi/events/${thread.id}?since=t2:0&since=t2:1`)
    assert.equal(repeated.status, 400)
    assert.match(await repeated.text(), /single value/i)
  })
})
