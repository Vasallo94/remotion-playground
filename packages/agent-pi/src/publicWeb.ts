import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_BYTES = 20_000
const DEFAULT_MAX_REDIRECTS = 3

export interface PublicFetchOptions {
  signal?: AbortSignal
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
}

export interface PublicFetchResult {
  url: string
  contentType: string
  text: string
  truncated: boolean
}

export interface PublicSearchResult {
  title: string
  url: string
  snippet: string
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

export function isPrivateIpAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0]
  const family = isIP(normalized)
  if (family === 4) return isPrivateIpv4(normalized)
  if (family !== 6) return true
  if (normalized === "::" || normalized === "::1") return true
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true
  if (/^fe[89ab]/.test(normalized)) return true
  if (normalized.startsWith("ff")) return true
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
  return mapped ? isPrivateIpv4(mapped) : false
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "")
  return (
    normalized === "localhost" ||
    !normalized.includes(".") ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  )
}

export async function assertPublicHttpsUrl(rawUrl: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error("URL must be a valid absolute HTTPS URL")
  }
  if (url.protocol !== "https:") throw new Error("Only HTTPS URLs are allowed")
  if (url.username || url.password) throw new Error("Credentialed URLs are not allowed")
  if (url.port && url.port !== "443") throw new Error("Only the default HTTPS port is allowed")
  if (isLocalHostname(url.hostname)) throw new Error("Local or single-label hostnames are not allowed")

  if (isIP(url.hostname)) {
    if (isPrivateIpAddress(url.hostname)) throw new Error("Private, loopback, or link-local IPs are not allowed")
    return url
  }

  let addresses: Array<{ address: string }>
  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true })
  } catch {
    throw new Error(`Could not resolve public hostname: ${url.hostname}`)
  }
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIpAddress(address))) {
    throw new Error("Hostname resolves to a private, loopback, or link-local address")
  }
  return url
}

function decodeHtml(text: string): string {
  return text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
}

async function readCappedBody(response: Response, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  if (!response.body) return { text: "", truncated: false }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let truncated = false
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const remaining = maxBytes - total
      if (remaining <= 0) {
        truncated = true
        break
      }
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value
      chunks.push(chunk)
      total += chunk.byteLength
      if (chunk.byteLength < value.byteLength) {
        truncated = true
        break
      }
    }
  } finally {
    if (truncated) await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { text: new TextDecoder().decode(bytes), truncated }
}

export async function fetchPublicText(rawUrl: string, options: PublicFetchOptions = {}): Promise<PublicFetchResult> {
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  let url = await assertPublicHttpsUrl(rawUrl)

  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const response = await fetch(url, {
      headers: { "User-Agent": "ClaquetaPiResearch/1.0", Accept: "text/html,application/json,text/plain" },
      redirect: "manual",
      signal,
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location) throw new Error(`Redirect from ${url.toString()} has no location`)
      if (redirect === maxRedirects) throw new Error(`Too many redirects (max ${maxRedirects})`)
      url = await assertPublicHttpsUrl(new URL(location, url).toString())
      continue
    }
    if (!response.ok) throw new Error(`Public fetch failed with HTTP ${response.status}`)
    const contentType = response.headers.get("content-type") ?? ""
    const body = await readCappedBody(response, maxBytes)
    return {
      url: url.toString(),
      contentType,
      text: contentType.includes("text/html") ? decodeHtml(body.text) : body.text,
      truncated: body.truncated,
    }
  }
  throw new Error("Public fetch redirect loop")
}

function flattenRelatedTopics(value: unknown, results: PublicSearchResult[]): void {
  if (!Array.isArray(value)) return
  for (const item of value) {
    if (results.length >= 5 || typeof item !== "object" || item === null) break
    const record = item as Record<string, unknown>
    if (typeof record.FirstURL === "string" && typeof record.Text === "string") {
      results.push({
        title: record.Text.split(" - ")[0]?.slice(0, 160) || "Result",
        url: record.FirstURL,
        snippet: record.Text.slice(0, 500),
      })
    } else {
      flattenRelatedTopics(record.Topics, results)
    }
  }
}

export async function searchPublicWeb(query: string, signal?: AbortSignal): Promise<PublicSearchResult[]> {
  const endpoint = new URL("https://api.duckduckgo.com/")
  endpoint.search = new URLSearchParams({ q: query, format: "json", no_html: "1", no_redirect: "1" }).toString()
  const response = await fetchPublicText(endpoint.toString(), { signal, maxBytes: 30_000 })
  if (response.truncated) throw new Error("Search response exceeded the 30KB limit")
  const data = JSON.parse(response.text) as Record<string, unknown>
  const results: PublicSearchResult[] = []
  if (typeof data.AbstractText === "string" && data.AbstractText && typeof data.AbstractURL === "string") {
    results.push({
      title: typeof data.Heading === "string" && data.Heading ? data.Heading : "Overview",
      url: data.AbstractURL,
      snippet: data.AbstractText.slice(0, 1000),
    })
  }
  flattenRelatedTopics(data.RelatedTopics, results)
  return results.slice(0, 5)
}
