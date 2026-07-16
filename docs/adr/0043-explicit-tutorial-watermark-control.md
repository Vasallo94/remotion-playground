# ADR 0043: Explicit Tutorial Watermark Control

- Status: Accepted
- Date: 2026-07-13

## Context and problem statement

A live Pi-only E2E requested a brand-free frame with no mascot, logo, or watermark. Scene QA correctly rejected the rendered still because `ClaudeCodeTutorial` unconditionally rendered `LogoWatermark` whenever the selected theme disabled its mascot. The configuration contract had no way to represent the approved no-watermark requirement.

How should the parent-produced configuration represent watermark intent without changing existing videos?

## Decision drivers

- Explicit approved requirements must be representable in deterministic configuration data.
- Visual QA must be able to verify the exact configured result.
- Existing configs must keep their current rendering unless they opt out.
- Scene components must not inspect theme names directly.

## Considered options

### Keep watermark behavior derived only from theme

Rejected. Theme selection cannot express a brand-free render because non-mascot themes automatically receive the logo watermark.

### Remove the logo watermark globally

Rejected. This would silently change existing videos and erase intentional identity.

### Add an explicit configuration switch

Chosen. Add `watermark: boolean` to `TutorialConfigSchema`, defaulting to `true`, and gate only the composition-level `LogoWatermark` overlay with it. Theme mascot behavior and explicit signatures remain separate contracts.

## Decision outcome

`ClaudeCodeTutorial` renders its logo watermark only when `watermark !== false`, the theme does not render its mascot, and no explicit signature is present. Configurator inputs include the exact runtime schema, allowing an approved no-watermark requirement to compile to `watermark: false`.

### Consequences

- Existing configurations preserve their watermark by default.
- Brand-free configurations can be represented and reviewed deterministically.
- The switch does not suppress a theme-owned mascot; selecting such a theme remains a separate explicit target decision.
- Live E2E must verify the resulting still, not merely the config value.

## Validation

- Typecheck and render-schema validation cover the new field.
- Live Scene QA must report no unauthorized mascot, logo, or watermark when `watermark` is false under a non-mascot theme.
