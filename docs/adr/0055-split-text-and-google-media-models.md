# ADR 0055: Split text reasoning from Google media models

- Status: Accepted
- Date: 2026-07-23

## Context

Claqueta's Pi runtime has two different model workloads:

- text-only judgment and generation (intake, research, copywriting, direction, audio planning, scene composition, configuration and validation);
- media work that benefits from Google models (image-grounded Scene QA and Gemini voice generation).

The deployment already has Azure OpenAI Luna/Sol definitions in Pi's `models.json` and a Google Vertex service account for media generation. Compose nevertheless used `openai-codex` route names, sent Scene QA to Sol, mounted only `auth.json`, and did not expose the Google service account to `agent-pi`. That made routing depend on accidental host state and prevented the intended provider separation.

## Decision drivers

- Keep text generation independent from Gemini availability and preview-model churn.
- Use the existing Azure OpenAI Luna/Sol deployments rather than adding another provider.
- Preserve Gemini where pixels or media are the actual input/output.
- Reuse Application Default Credentials through a read-only service-account mount.
- Never bake credentials into Docker images or repository files.

## Considered options

### Use Gemini for every Pi specialist

Rejected. It couples all creative and research stages to Google model availability and caused the observed Vertex model failure.

### Use Azure OpenAI for every task, including visual QA

Rejected. It removes the intended Google multimodal path and leaves the service account unused for image-grounded review.

### Split providers by modality

Chosen. Azure OpenAI Luna/Sol handle text-only tasks. Google Vertex Gemini handles image-grounded Scene QA, while the existing Google GenAI script handles voice generation with the same service-account path.

## Decision

1. Default all text-only Pi routes to `azure-openai/gpt-5.6-luna` or `azure-openai/gpt-5.6-sol`.
2. Default `scene_qa` to `google-vertex/gemini-2.5-flash`.
3. Mount the host Pi `models.json` read-only so the Azure deployment catalog is available inside `agent-pi`.
4. Mount the configured Google service-account JSON read-only at a stable container path and set `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_PROJECT`, and `GOOGLE_CLOUD_LOCATION`.
5. Pass Azure provider environment into `agent-pi`; secrets remain runtime-only.
6. Keep environment route overrides, but validate that configured models resolve before work starts.
7. Adapt the mounted service account into Pi's in-memory `google-vertex` credential using its reserved `gcp-vertex-credentials` marker. This satisfies Pi's session preflight while the provider still authenticates with ADC; no API key or service-account secret is copied.
8. After CP3 approval, Pi invokes the same deterministic Gemini TTS generator used by DeepAgent automatically. CP3 is the API-use approval boundary; the generator's fingerprint cache and MP3 verification remain intact, and render never regenerates audio.

Voice generation preserves the former DeepAgent implementation: Gemini TTS `gemini-3.1-flash-tts-preview` through Vertex service-account ADC. It is not replaced with a generic transcription or Whisper stage.

## Consequences

### Positive

- A Google LLM outage or model rename no longer blocks research or writing.
- Scene QA remains genuinely image-grounded on Gemini.
- One service-account mount serves Google media calls without API keys.
- Route mistakes fail with a direct diagnostic instead of a late provider error.

### Negative

- Local and Docker runs require Pi's Azure model catalog plus the corresponding Azure environment.
- Google and Azure credentials must both be provisioned for a complete production run.
- Video-native Gemini review remains future work; current Scene QA sends ordered rendered stills.

## Validation

Validated on 2026-07-23: route tests and the full 263-test `agent-pi` suite pass, typecheck passes, Compose starts healthy with read-only mounts, Researcher completes through Azure Luna, Google Vertex `gemini-2.5-flash` receives a real PNG and returns a structured tool call through the service account, and Pi's real `AudioAssetProducer` generates and verifies a 9,453-byte Gemini TTS MP3 through the same service account.
