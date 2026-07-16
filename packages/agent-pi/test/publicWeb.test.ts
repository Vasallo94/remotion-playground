import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import { assertPublicHttpsUrl, fetchPublicText, isPrivateIpAddress } from "../src/publicWeb.js"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("public web safety", () => {
  it("classifies private and public IP ranges", () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "169.254.1.1",
      "172.16.0.1",
      "192.168.1.1",
      "::1",
      "fd00::1",
      "fe80::1",
    ]) {
      assert.equal(isPrivateIpAddress(address), true, address)
    }
    assert.equal(isPrivateIpAddress("1.1.1.1"), false)
    assert.equal(isPrivateIpAddress("2606:4700:4700::1111"), false)
  })

  it("rejects unsafe URL shapes before fetching", async () => {
    await assert.rejects(() => assertPublicHttpsUrl("http://1.1.1.1/path"), /Only HTTPS/)
    await assert.rejects(() => assertPublicHttpsUrl("https://user:pass@1.1.1.1/path"), /Credentialed/)
    await assert.rejects(() => assertPublicHttpsUrl("https://127.0.0.1/path"), /Private/)
    await assert.rejects(() => assertPublicHttpsUrl("https://localhost/path"), /Local/)
    await assert.rejects(() => assertPublicHttpsUrl("https://example.com:8443/path"), /default HTTPS port/)
    assert.equal((await assertPublicHttpsUrl("https://1.1.1.1/path")).hostname, "1.1.1.1")
  })

  it("caps response bytes and blocks redirects to private targets", async () => {
    globalThis.fetch = async () =>
      new Response("x".repeat(100), { status: 200, headers: { "content-type": "text/plain" } })
    const capped = await fetchPublicText("https://1.1.1.1/data", { maxBytes: 12 })
    assert.equal(capped.text, "x".repeat(12))
    assert.equal(capped.truncated, true)

    globalThis.fetch = async () =>
      new Response(null, { status: 302, headers: { location: "https://127.0.0.1/private" } })
    await assert.rejects(() => fetchPublicText("https://1.1.1.1/start"), /Private/)
  })
})
