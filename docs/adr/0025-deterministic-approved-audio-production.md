# 0025. Produce approved audio with deterministic parent-owned tools

## Status

Accepted — cost-gate clause amended by ADR 0055

## Context

After CP3, Claqueta has an approved audio chart. Voice and sound asset creation no longer requires creative judgment: it must faithfully materialize approved narration and local music choices. The legacy runtime delegates voice generation to another LLM subagent, even though that agent only forwards an approved config to a deterministic tool. The existing TypeScript scripts already implement Gemini TTS, fingerprints, MP3 conversion, and sound generation, but they are command-line programs with external API side effects.

The Pi runtime must preserve explicit cost control, isolate process execution, verify outputs, and represent silent or music-free decisions as successful skips. The current Pi audio chart intentionally disallows generated music and SFX because no compatible approved inventory contract exists.

## Decision Drivers

- Automate execution, not already-approved creative criterion.
- Prevent accidental API spend.
- Reuse proven voice generation and caching rather than duplicate provider code.
- Avoid shell injection and arbitrary command execution.
- Verify files instead of trusting process exit text.
- Keep local library copies credential-free.
- Track voice and sound pipeline outcomes independently.

## Considered Options

### Option 1 — Add voice-generator and sound-engineer LLM specialists

- Pros: mirrors the legacy agent graph.
- Cons: adds latency and failure modes without making a creative decision; broadens tool authority unnecessarily.

### Option 2 — Let final rendering generate all audio implicitly

- Pros: no additional runtime surface.
- Cons: poor progress visibility, mixed render/audio failures, and less precise recovery.

### Option 3 — Parent-owned deterministic production before final render

- Pros: narrow authority, explicit cost gate, independently recoverable steps, and verifiable artifacts.
- Cons: requires a small process/copy orchestration layer.

## Decision

Choose Option 3.

The parent runtime exposes a narrow audio-production tool that accepts approved artifact ids, not arbitrary commands or paths. It:

1. revalidates the approved chart and config identity;
2. marks `voice_generation` and `sound_assets` independently;
3. treats disabled layers as successful skips;
4. copies approved local music directly;
5. invokes the fixed TypeScript voice generator through `execFile` without a shell after explicit CP3 approval;
6. applies a timeout and bounded output;
7. verifies expected MP3 files and persists an `audio_assets` manifest.

Generated music and SFX remain unsupported in this slice and fail explicitly if encountered. Final render may use the verified assets without making new creative choices.

## Consequences

- No additional LLM session is needed after CP3 for audio execution.
- Silent videos and local-music-only videos work without credentials.
- Voice API spending requires explicit human approval at CP3; ADR 0055 removed the redundant environment opt-in to restore DeepAgent behavior.
- Existing voice fingerprints remain reusable.
- Provider credential loading remains in the legacy TypeScript generator for now; a later security hardening slice may move local credentials from `.env` to macOS Keychain without changing this orchestration contract.
