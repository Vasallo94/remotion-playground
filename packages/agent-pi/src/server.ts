import { basename, join } from "node:path"
import express from "express"
import cors from "cors"
import { pathToFileURL } from "node:url"
import { AgentPiStore } from "./store.js"
import { ThreadEventBus, encodeSseEvent, parseEventCursor } from "./events.js"
import { AgentRuntimeManager } from "./session.js"
import { isPipelineMode } from "./coordinator.js"
import type { PiSseEvent } from "./types.js"

export function createApp(runtime = createDefaultRuntime()) {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: "10mb" }))

  app.get("/api/pi/health", (_req, res) => {
    res.json({ ok: true })
  })

  app.get("/api/pi/model-routes", (_req, res) => {
    res.json(runtime.modelRouter.config)
  })

  app.get("/api/pi/threads", (_req, res) => {
    res.json({ threads: runtime.store.listThreads() })
  })

  app.get("/api/pi/candidate-preview/:candidateId/:fileName", (req, res) => {
    const { candidateId, fileName } = req.params
    if (!/^candidate\.[a-z0-9.-]{3,100}$/.test(candidateId) || !/^scene-\d+\.png$/.test(fileName)) {
      res.status(400).json({ error: "Invalid candidate preview path" })
      return
    }
    const directory = join(runtime.cwd, ".generated/claqueta-pi/candidates", candidateId)
    if (basename(fileName) !== fileName) {
      res.status(400).json({ error: "Invalid candidate preview file" })
      return
    }
    res.sendFile(fileName, { root: directory }, (error) => {
      if (error && !res.headersSent) res.status(404).json({ error: "Candidate preview not found" })
    })
  })

  app.get("/api/pi/thread/:threadId", (req, res) => {
    const thread = runtime.store.getThread(req.params.threadId)
    if (!thread) {
      res.status(404).json({ error: "Thread not found" })
      return
    }
    res.json({
      thread,
      plan: runtime.store.getPipelinePlan(thread.id),
      artifacts: runtime.store.listArtifacts(thread.id),
      events: runtime.store.listEvents(thread.id),
    })
  })

  app.post("/api/pi/chat", async (req, res) => {
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : ""
    const requestedThreadId = typeof req.body?.threadId === "string" ? req.body.threadId : null
    const requestedMode = req.body?.mode
    if (!message) {
      res.status(400).json({ error: "message is required" })
      return
    }

    try {
      if (!requestedThreadId && !isPipelineMode(requestedMode)) {
        res.status(400).json({ error: "A new thread requires an explicit valid mode" })
        return
      }
      const threadId = await runtime.getOrCreateThread(requestedThreadId, message)
      void runtime
        .sendMessage(threadId, message, { mode: isPipelineMode(requestedMode) ? requestedMode : undefined })
        .catch(() => {})
      res.json({ threadId })
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  app.post("/api/pi/retry", (req, res) => {
    const threadId = typeof req.body?.threadId === "string" ? req.body.threadId : ""
    if (!threadId) {
      res.status(400).json({ error: "threadId is required" })
      return
    }

    try {
      void runtime.retryCurrentAction(threadId).catch(() => {})
      res.json({ threadId, accepted: true })
    } catch (error) {
      res.status(409).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  app.post("/api/pi/resume", async (req, res) => {
    const threadId = typeof req.body?.threadId === "string" ? req.body.threadId : ""
    const decision = req.body?.decision
    if (!threadId || typeof decision !== "object" || decision === null || Array.isArray(decision)) {
      res.status(400).json({ error: "threadId and decision object are required" })
      return
    }

    try {
      void runtime
        .resumeCheckpoint(threadId, decision as Record<string, unknown>)
        .catch((error) => runtime.recordDetachedFailure(threadId, error))
      res.json({ threadId, accepted: true })
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  app.get("/api/pi/events/:threadId", (req, res) => {
    const threadId = req.params.threadId
    const thread = runtime.store.getThread(threadId)
    if (!thread) {
      res.status(404).json({ error: "Thread not found" })
      return
    }

    let replayAfter = 0
    try {
      if (req.query.since !== undefined && typeof req.query.since !== "string") {
        throw new Error("Event cursor must be a single value")
      }
      const cursor = parseEventCursor(req.header("last-event-id") ?? req.query.since)
      if (cursor.kind === "v2") replayAfter = cursor.seq
      if (cursor.kind === "legacy") replayAfter = runtime.store.legacyEventIdToThreadSeq(threadId, cursor.eventId)
      if (replayAfter > thread.lastEventSeq) throw new Error("Event cursor is in the future")
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) })
      return
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    })

    const buffered: PiSseEvent[] = []
    let replaying = true
    const unsubscribe = runtime.eventBus.subscribe(threadId, (event) => {
      if (replaying) buffered.push(event)
      else res.write(encodeSseEvent(event))
    })
    const highWater = runtime.store.getThread(threadId)?.lastEventSeq ?? 0
    const replayed = new Set<number>()
    let after = replayAfter
    while (after < highWater) {
      const page = runtime.store.listEvents(threadId, after, 500).filter((event) => event.seq <= highWater)
      if (page.length === 0) break
      for (const event of page) {
        if (!replayed.has(event.seq)) {
          replayed.add(event.seq)
          res.write(encodeSseEvent(event))
        }
      }
      after = page[page.length - 1]!.seq
    }
    replaying = false
    for (const event of buffered.sort((left, right) => left.seq - right.seq)) {
      if (event.seq > replayAfter && !replayed.has(event.seq)) {
        replayed.add(event.seq)
        res.write(encodeSseEvent(event))
      }
    }

    const keepAlive = setInterval(() => {
      res.write(`: keep-alive ${Date.now()}\n\n`)
    }, 15000)

    req.on("close", () => {
      clearInterval(keepAlive)
      unsubscribe()
      res.end()
    })
  })

  return app
}

export function createDefaultRuntime(): AgentRuntimeManager {
  const store = new AgentPiStore(process.env.AGENT_PI_DB)
  const eventBus = new ThreadEventBus(store)
  return new AgentRuntimeManager({ store, eventBus })
}

const PORT = Number.parseInt(process.env.PORT ?? process.env.AGENT_PI_PORT ?? "3200", 10)
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const app = createApp()
  app.listen(PORT, () => {
    console.log(`Agent Pi runtime listening on :${PORT}`)
  })
}
