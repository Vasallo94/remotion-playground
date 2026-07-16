// src/shared/sceneTimingRegistry.ts

interface SceneTimingEntry {
  visualReadyMs: number
}

export const sceneTimingRegistry: Record<string, SceneTimingEntry> = {
  // Built-in scenes
  intro: { visualReadyMs: 100 },
  terminal: { visualReadyMs: 150 },
  callout: { visualReadyMs: 100 },
  outro: { visualReadyMs: 100 },

  // ProductShort scenes
  hero: { visualReadyMs: 100 },
  benefits: { visualReadyMs: 100 },
  pricing: { visualReadyMs: 100 },
  cta: { visualReadyMs: 100 },

  // Custom scenes
  "annotated-image": { visualReadyMs: 100 },
  "api-request": { visualReadyMs: 150 },
  "bar-chart": { visualReadyMs: 100 },
  "before-after": { visualReadyMs: 100 },
  "big-number": { visualReadyMs: 100 },
  "block-diagram": { visualReadyMs: 150 },
  "browser-mockup": { visualReadyMs: 150 },
  "bullet-slide": { visualReadyMs: 100 },
  "chapter-card": { visualReadyMs: 100 },
  "code-block": { visualReadyMs: 150 },
  "code-diff": { visualReadyMs: 150 },
  "comparison-table": { visualReadyMs: 100 },
  "composed-scene": { visualReadyMs: 120 },
  countdown: { visualReadyMs: 100 },
  "file-explorer": { visualReadyMs: 150 },
  "flow-diagram": { visualReadyMs: 150 },
  "icon-grid": { visualReadyMs: 100 },
  "logo-wall": { visualReadyMs: 100 },
  "media-card": { visualReadyMs: 100 },
  "problem-solution": { visualReadyMs: 100 },
  "progress-bars": { visualReadyMs: 100 },
  quote: { visualReadyMs: 100 },
  "split-screen": { visualReadyMs: 100 },
  "stat-reveal": { visualReadyMs: 100 },
  "step-list": { visualReadyMs: 100 },
  timeline: { visualReadyMs: 100 },
  "two-column-text": { visualReadyMs: 100 },
  "visual-program": { visualReadyMs: 100 },
}

export const DEFAULT_VISUAL_READY_MS = 200

export function getVisualReadyMs(sceneType: string, componentId?: string): number {
  const key = sceneType === "custom" && componentId ? componentId : sceneType
  return sceneTimingRegistry[key]?.visualReadyMs ?? DEFAULT_VISUAL_READY_MS
}
