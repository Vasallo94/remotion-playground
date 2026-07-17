import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildGenericCheckpointPresentation } from "../components/GenericCheckpointCard.js"
import {
  checkpointDataWithArtifact,
  isCurrentPiRequest,
  isPiAuthorityEventCoveredBySnapshot,
  shouldApplyPiSnapshot,
} from "./usePiVideoStream.js"

describe("Pi thread authority reconciliation", () => {
  it("rejects stale snapshots and callbacks from another thread generation", () => {
    assert.equal(shouldApplyPiSnapshot("thread-a", 2, 2, 3, 3, 7, { id: "thread-a", revision: 8 }), true)
    assert.equal(shouldApplyPiSnapshot("thread-a", 1, 2, 3, 3, 7, { id: "thread-a", revision: 8 }), false)
    assert.equal(shouldApplyPiSnapshot("thread-b", 2, 2, 3, 3, 7, { id: "thread-a", revision: 8 }), false)
    assert.equal(shouldApplyPiSnapshot("thread-a", 2, 2, 2, 3, 7, { id: "thread-a", revision: 8 }), false)
    assert.equal(shouldApplyPiSnapshot("thread-a", 2, 2, 3, 3, 7, { id: "thread-a", revision: 6 }), false)
    assert.equal(isCurrentPiRequest(4, 4, 2, 2), true)
    assert.equal(isCurrentPiRequest(3, 4, 2, 2), false)
    assert.equal(isCurrentPiRequest(4, 4, 1, 2), false)
  })

  it("hydrates checkpoint cards from the exact artifact before applying authority metadata", () => {
    assert.deepEqual(
      checkpointDataWithArtifact(
        {
          id: "cp-script",
          type: "script_checkpoint",
          artifactId: "script-2",
          payload: { version: 2 },
        },
        [{ id: "script-2", data: { title: "Approved script", scenes: [{ type: "callout" }] } }],
      ),
      {
        title: "Approved script",
        scenes: [{ type: "callout" }],
        version: 2,
        checkpointId: "cp-script",
        checkpointType: "script_checkpoint",
        artifactId: "script-2",
      },
    )
  })

  it("projects clarification into human copy without exposing the target registry", () => {
    const presentation = buildGenericCheckpointPresentation({
      checkpointType: "target_clarification",
      questions: [
        {
          field: "format",
          question: "¿Qué formato compatible debemos usar?",
          requested: "MP4 horizontal",
          supported: ["video/mp4"],
        },
      ],
      registry: [{ secretImplementationDetail: "DO_NOT_RENDER" }],
    })

    assert.equal(presentation.isClarification, true)
    assert.equal(presentation.title, "Necesitamos una aclaración")
    assert.equal(presentation.questions[0]?.question, "¿Qué formato compatible debemos usar?")
    assert.equal("registry" in presentation.technicalData, false)
    assert.equal(
      buildGenericCheckpointPresentation({ checkpointType: "qa_report_checkpoint" }).title,
      "Revisión visual",
    )
    assert.equal(
      buildGenericCheckpointPresentation({ checkpointType: "final_review_checkpoint" }).title,
      "Revisión final del render",
    )
  })

  it("does not let replay resurrect authority already covered by a snapshot", () => {
    assert.equal(
      isPiAuthorityEventCoveredBySnapshot(5, {
        seq: 10,
        revision: 5,
        threadId: "thread-a",
        type: "checkpoint",
        payload: {},
      }),
      true,
    )
    assert.equal(
      isPiAuthorityEventCoveredBySnapshot(5, {
        seq: 11,
        revision: 6,
        threadId: "thread-a",
        type: "checkpoint",
        payload: {},
      }),
      false,
    )
    assert.equal(
      isPiAuthorityEventCoveredBySnapshot(5, {
        seq: 4,
        revision: 4,
        threadId: "thread-a",
        type: "message_delta",
        payload: { delta: "history" },
      }),
      false,
    )
  })
})
