import express from "express"
import cors from "cors"
import { pathToFileURL } from "node:url"
import { AgentPiStore } from "./store.js"
import { ThreadEventBus, encodeSseEvent } from "./events.js"
import { AgentRuntimeManager } from "./session.js"

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

  app.get("/api/pi/thread/:threadId", (req, res) => {
    const thread = runtime.store.getThread(req.params.threadId)
    if (!thread) {
      res.status(404).json({ error: "Thread not found" })
      return
    }
    res.json({ thread, artifacts: runtime.store.listArtifacts(thread.id), events: runtime.store.listEvents(thread.id) })
  })

  app.post("/api/pi/chat", async (req, res) => {
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : ""
    const requestedThreadId = typeof req.body?.threadId === "string" ? req.body.threadId : null
    if (!message) {
      res.status(400).json({ error: "message is required" })
      return
    }

    try {
      const threadId = await runtime.getOrCreateThread(requestedThreadId, message)
      void runtime.sendMessage(threadId, message).catch(() => {})
      res.json({ threadId })
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) })
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
      void runtime.resumeCheckpoint(threadId, decision as Record<string, unknown>).catch(() => {})
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

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    })

    const lastEventId = Number(req.header("last-event-id") ?? req.query.since ?? 0)
    const replayAfter = Number.isFinite(lastEventId) ? lastEventId : 0
    for (const event of runtime.store.listEvents(threadId, replayAfter)) {
      res.write(encodeSseEvent(event))
    }

    const unsubscribe = runtime.eventBus.subscribe(threadId, (event) => {
      res.write(encodeSseEvent(event))
    })

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
