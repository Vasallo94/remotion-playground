import { Client } from "@langchain/langgraph-sdk"
import type { ConfigListResponse, JobListResponse, RenderJob } from "./types"

export const client = new Client({
  apiUrl: import.meta.env.VITE_LANGGRAPH_URL ?? "http://127.0.0.1:2024",
})

export const ASSISTANT_ID = "claqueta"

const RENDER_URL = import.meta.env.VITE_RENDER_URL ?? "http://127.0.0.1:3100"
export const AGENT_PI_URL = import.meta.env.VITE_AGENT_PI_URL ?? "http://127.0.0.1:3200"

export async function fetchJobStatus(jobId: string): Promise<RenderJob> {
  const res = await fetch(`${RENDER_URL}/api/render/${jobId}/status`)
  return res.json()
}

export async function fetchJobs(limit = 20, offset = 0): Promise<JobListResponse> {
  const res = await fetch(`${RENDER_URL}/api/render/jobs?limit=${limit}&offset=${offset}`)
  return res.json()
}

export async function fetchConfigs(): Promise<ConfigListResponse> {
  const res = await fetch(`${RENDER_URL}/api/configs`)
  return res.json()
}

export async function fetchLatestRender(configId: string): Promise<RenderJob | null> {
  const res = await fetch(`${RENDER_URL}/api/render/jobs?config_id=${encodeURIComponent(configId)}`)
  const body: JobListResponse = await res.json()
  const done = body.jobs.find((j) => j.status === "done")
  return done ?? null
}

export function getStreamUrl(jobId: string): string {
  return `${RENDER_URL}/api/render/${jobId}/stream`
}

export function getDownloadUrl(jobId: string): string {
  return `${RENDER_URL}/api/render/${jobId}/download`
}

export async function sendPiChat(message: string, threadId?: string | null): Promise<{ threadId: string }> {
  const res = await fetch(`${AGENT_PI_URL}/api/pi/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, threadId }),
  })
  if (!res.ok) throw new Error(`Pi chat failed: ${await res.text()}`)
  return res.json()
}

export async function resumePiCheckpoint(
  threadId: string,
  decision: Record<string, unknown>,
): Promise<{ threadId: string; accepted: boolean }> {
  const res = await fetch(`${AGENT_PI_URL}/api/pi/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ threadId, decision }),
  })
  if (!res.ok) throw new Error(`Pi resume failed: ${await res.text()}`)
  return res.json()
}

export function getPiEventsUrl(threadId: string, since?: number): string {
  const url = new URL(`${AGENT_PI_URL}/api/pi/events/${threadId}`)
  if (since != null) url.searchParams.set("since", String(since))
  return url.toString()
}
