# 0024. Separate topic-neutral audio planning from asset generation

## Status

Accepted

## Context

The legacy audio planner mixed creative planning, local-library discovery, Gemini TTS configuration, brand/topic examples, checkpoint ownership, config mutation, and assumptions about later asset generation. Porting it verbatim would give an isolated Pi specialist too many responsibilities and preserve recipes such as choosing a voice or sound effect from the video's subject category.

Claqueta currently has a small local music library, Gemini TTS support in the legacy production path, and no compatible local SFX inventory contract. The Pi runtime also keeps audio generation behind an explicit environment flag. The first Pi audio slice therefore needs to recover human-approved creative planning without pretending that unavailable assets can be produced.

## Decision Drivers

- Keep the audio role topic-neutral.
- Preserve human approval before any costly or irreversible asset generation.
- Use only real voice ids and local library inventory.
- Support silent videos and narration-free scenes as deliberate choices.
- Keep specialist output structured and independently validatable.
- Avoid granting filesystem, shell, copying, TTS, or generation tools to the planner.
- Leave a clean contract for later voice and sound production specialists.

## Considered Options

### Option 1 — Port the full legacy audio pipeline into one specialist

- Pros: feature parity in one slice.
- Cons: combines creative judgment with side effects, credentials, retries, and unavailable SFX assumptions.

### Option 2 — Plan and generate assets before human review

- Pros: the checkpoint can preview finished assets.
- Cons: wastes API calls and violates the project principle that humans approve creative criteria before technical execution.

### Option 3 — Produce a validated audio chart, approve CP3, then generate in later steps

- Pros: clean responsibility boundary, deterministic validation, no wasted generation, and direct compatibility with human review.
- Cons: this slice does not yet produce playable voice/music assets.

## Decision

Choose Option 3.

The isolated Pi audio planner receives the approved script and direction, explicit user preferences, the exact Gemini voice catalog, and a read-only snapshot of the actual audio library. It has one terminating structured-output tool and no production tools.

Its chart may choose:

- no voiceover, or Gemini single-speaker voiceover;
- Gemini two-speaker dialogue with exactly two distinct configured voices;
- no sound design, or a music bed whose `libraryId` exists in the inventory;
- no SFX unless the runtime exposes a compatible local SFX inventory contract.

The parent validates scene indexes, speaker references, voice ids, volume/range values, and library ids, persists `audio-chart.json`, and owns CP3. Human feedback creates a new isolated planning run with the previous chart. Asset generation remains a subsequent technical slice.

## Consequences

- Audio decisions become visible and reviewable without spending generation quota.
- A video's subject does not implicitly select voices, music, pacing, or SFX.
- The small current library may legitimately yield `musicBed: null` for many requests.
- Existing legacy generation scripts can later consume the approved chart through dedicated voice-generator and sound-engineer tools.
- SFX planning stays conservative until a real local-library metadata/targeting contract is available.
