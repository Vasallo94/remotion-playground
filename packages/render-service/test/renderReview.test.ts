import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, it } from "node:test"
import { buildRenderReview } from "../src/renderReview"

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

function output(): string {
  const dir = mkdtempSync(join(tmpdir(), "claqueta-render-review-"))
  dirs.push(dir)
  const path = join(dir, "output.mp4")
  writeFileSync(path, "mp4-data")
  return path
}

const config = {
  width: 1280,
  height: 720,
  fps: 30,
  scenes: [{ durationInSeconds: 3 }, { durationInSeconds: 4 }],
  voiceover: { enabled: true, scenes: { "0": "Narration" } },
}

describe("buildRenderReview", () => {
  it("passes matching video/audio metadata", () => {
    const report = buildRenderReview(config, output(), {
      format: { duration: "7.02" },
      streams: [
        { codec_type: "video", codec_name: "h264", width: 1280, height: 720, avg_frame_rate: "30/1" },
        { codec_type: "audio", codec_name: "aac" },
      ],
    })
    assert.equal(report.passed, true)
    assert.equal(report.duration.matches, true)
    assert.equal(report.audio.matchesExpectation, true)
  })

  it("reports missing audio and metadata mismatches as blocking failures", () => {
    const report = buildRenderReview(config, output(), {
      format: { duration: "9.0" },
      streams: [{ codec_type: "video", codec_name: "h264", width: 1920, height: 1080, avg_frame_rate: "24/1" }],
    })
    assert.equal(report.passed, false)
    assert.equal(report.audio.present, false)
    assert.match(report.failures.join(" "), /expects audio/)
    assert.match(report.failures.join(" "), /Dimensions/)
    assert.match(report.failures.join(" "), /Duration/)
  })
})
