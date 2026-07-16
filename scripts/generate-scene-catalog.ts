// scripts/generate-scene-catalog.ts
// Usage: npx tsx scripts/generate-scene-catalog.ts
// Reads customSceneRegistry.ts to get component IDs
// Outputs src/shared/scene-catalog.json

import fs from "fs"
import path from "path"
import ts from "typescript"
import { COMPOSED_SCENE_CONTRACT_SUMMARY } from "@claqueta/scene-contracts"

// Import the registry
import { customSceneRegistry } from "../src/compositions/ClaudeCodeTutorial/customSceneRegistry"

interface SceneCatalogEntry {
  componentId: string
  composition: string
  description: string
  narrativeRoles: string[]
  bestFor: string[]
  avoidWhen: string[]
  textLimits: {
    maxVisibleWords: number
    maxWordsPerSecond: number
  }
  durationRange: [number, number]
  recommendedBeats: number
  placement: string[]
  exampleUse: string
  propContract?: string
}

interface BuiltinSceneCatalogEntry {
  type: string
  composition: string
  description: string
  narrativeRoles: string[]
  bestFor: string[]
  avoidWhen: string[]
  textLimits: {
    maxVisibleWords: number
    maxWordsPerSecond: number
  }
  durationRange: [number, number]
  recommendedBeats: number
  placement: string[]
  exampleUse: string
}

interface VideoTemplateStep {
  role: string
  preferredScene: string
  fallbackScenes: string[]
  purpose: string
  durationSeconds: [number, number]
}

interface VideoTemplate {
  templateId: string
  composition: "ClaudeCodeTutorial" | "ProductShort"
  description: string
  bestFor: string[]
  avoidWhen: string[]
  targetDurationSeconds: [number, number]
  narrativeArc: string[]
  steps: VideoTemplateStep[]
}

const DEFAULT_TEXT_LIMITS = {
  maxVisibleWords: 28,
  maxWordsPerSecond: 4,
}

const builtinScenes: Record<string, BuiltinSceneCatalogEntry> = {
  intro: {
    type: "intro",
    composition: "ClaudeCodeTutorial",
    description: "Opening title card with promise and context.",
    narrativeRoles: ["hook", "promise", "orientation"],
    bestFor: ["naming the topic", "setting audience expectation", "opening a tutorial"],
    avoidWhen: ["the video needs to start directly inside a product demo"],
    textLimits: { maxVisibleWords: 18, maxWordsPerSecond: 3 },
    durationRange: [2, 6],
    recommendedBeats: 1,
    placement: ["first"],
    exampleUse: "Open with the outcome the viewer will get, not just the feature name.",
  },
  terminal: {
    type: "terminal",
    composition: "ClaudeCodeTutorial",
    description: "Simulated CLI session with command, assistant response, and output lines.",
    narrativeRoles: ["demo", "proof", "workflow"],
    bestFor: ["Codex or Claude Code workflows", "commands", "agent/tool traces", "before/after CLI output"],
    avoidWhen: ["the key idea is conceptual and does not need command output"],
    textLimits: { maxVisibleWords: 55, maxWordsPerSecond: 5 },
    durationRange: [6, 35],
    recommendedBeats: 3,
    placement: ["middle"],
    exampleUse: "Show one realistic command and the exact result that proves the point.",
  },
  callout: {
    type: "callout",
    composition: "ClaudeCodeTutorial",
    description: "Short emphasized takeaway overlay.",
    narrativeRoles: ["takeaway", "warning", "transition"],
    bestFor: ["one-sentence lessons", "warnings", "bridges between demo sections"],
    avoidWhen: ["you need to show multiple related ideas or a full list"],
    textLimits: { maxVisibleWords: 22, maxWordsPerSecond: 4 },
    durationRange: [2, 6],
    recommendedBeats: 1,
    placement: ["middle", "near-end"],
    exampleUse: "State the principle the viewer should remember after a demo.",
  },
  outro: {
    type: "outro",
    composition: "ClaudeCodeTutorial",
    description: "Closing summary with bullets.",
    narrativeRoles: ["summary", "cta", "memory"],
    bestFor: ["recapping steps", "final takeaway", "soft call to action"],
    avoidWhen: ["the video is a direct-response vertical ad that needs a single CTA"],
    textLimits: { maxVisibleWords: 36, maxWordsPerSecond: 4 },
    durationRange: [3, 8],
    recommendedBeats: 2,
    placement: ["last"],
    exampleUse: "Close with 2-3 concrete actions or takeaways.",
  },
  hero: {
    type: "hero",
    composition: "ProductShort",
    description: "Vertical opening product/offer card.",
    narrativeRoles: ["hook", "offer", "promise"],
    bestFor: ["product name", "main offer", "benefit-first opening"],
    avoidWhen: ["the strongest hook is a user problem or objection"],
    textLimits: { maxVisibleWords: 14, maxWordsPerSecond: 3 },
    durationRange: [2, 5],
    recommendedBeats: 1,
    placement: ["first"],
    exampleUse: "Open with product plus one tangible benefit.",
  },
  benefits: {
    type: "benefits",
    composition: "ProductShort",
    description: "Animated list of product benefits.",
    narrativeRoles: ["benefits", "proof", "reassurance"],
    bestFor: ["three short benefits", "coverage highlights", "feature bundles"],
    avoidWhen: ["there is only one strong benefit; use hero or pricing instead"],
    textLimits: { maxVisibleWords: 30, maxWordsPerSecond: 4 },
    durationRange: [3, 8],
    recommendedBeats: 3,
    placement: ["middle"],
    exampleUse: "List benefits as outcomes, not internal product features.",
  },
  pricing: {
    type: "pricing",
    composition: "ProductShort",
    description: "Price or offer reveal card.",
    narrativeRoles: ["offer", "proof", "conversion"],
    bestFor: ["price anchors", "discounts", "offer reveals"],
    avoidWhen: ["price is unavailable or not the main persuasion point"],
    textLimits: { maxVisibleWords: 16, maxWordsPerSecond: 3 },
    durationRange: [2, 5],
    recommendedBeats: 1,
    placement: ["middle", "near-end"],
    exampleUse: "Reveal price after one reason to care.",
  },
  cta: {
    type: "cta",
    composition: "ProductShort",
    description: "Direct call-to-action closing card.",
    narrativeRoles: ["cta", "conversion", "close"],
    bestFor: ["quote requests", "website visits", "final brand action"],
    avoidWhen: ["the video is purely educational and needs a soft outro"],
    textLimits: { maxVisibleWords: 14, maxWordsPerSecond: 3 },
    durationRange: [2, 5],
    recommendedBeats: 1,
    placement: ["last"],
    exampleUse: "Use one action verb and one destination.",
  },
}

const customSceneMetadata: Record<string, Omit<SceneCatalogEntry, "componentId" | "composition">> = {
  "annotated-image": {
    description: "Image with positioned annotations.",
    narrativeRoles: ["evidence", "inspection", "explanation"],
    bestFor: ["screenshots", "UI details", "highlighting specific regions"],
    avoidWhen: ["there is no real image asset to inspect"],
    textLimits: { maxVisibleWords: 26, maxWordsPerSecond: 4 },
    durationRange: [4, 12],
    recommendedBeats: 2,
    placement: ["middle"],
    exampleUse: "Show a real UI screenshot and annotate only the decisive details.",
  },
  "api-request": {
    description: "API request/response visualization.",
    narrativeRoles: ["demo", "technical-proof", "workflow"],
    bestFor: ["API demos", "request payloads", "response shape"],
    avoidWhen: ["the endpoint details are not important to the viewer"],
    textLimits: { maxVisibleWords: 50, maxWordsPerSecond: 5 },
    durationRange: [6, 16],
    recommendedBeats: 3,
    placement: ["middle"],
    exampleUse: "Connect one request field to one visible response result.",
  },
  "bar-chart": {
    description: "Animated bar chart.",
    narrativeRoles: ["proof", "comparison", "data"],
    bestFor: ["rankings", "before/after metrics", "category comparisons"],
    avoidWhen: ["there are more than five categories or no numeric data"],
    textLimits: { maxVisibleWords: 20, maxWordsPerSecond: 3 },
    durationRange: [4, 10],
    recommendedBeats: 2,
    placement: ["middle", "near-end"],
    exampleUse: "Reveal the one bar that proves the main claim.",
  },
  "before-after": {
    description: "Side-by-side comparison.",
    narrativeRoles: ["problem-solution", "transformation", "proof"],
    bestFor: ["workflow improvements", "UI cleanup", "speed or clarity gains"],
    avoidWhen: ["the difference cannot be shown visually"],
    textLimits: { maxVisibleWords: 24, maxWordsPerSecond: 4 },
    durationRange: [4, 10],
    recommendedBeats: 2,
    placement: ["middle"],
    exampleUse: "Make the before state painful and the after state obviously simpler.",
  },
  "big-number": {
    description: "Large animated statistic.",
    narrativeRoles: ["proof", "impact", "hook"],
    bestFor: ["single KPI", "time saved", "cost saved", "scale"],
    avoidWhen: ["the number is not sourced or does not support the story"],
    textLimits: { maxVisibleWords: 16, maxWordsPerSecond: 3 },
    durationRange: [2, 6],
    recommendedBeats: 1,
    placement: ["first", "middle", "near-end"],
    exampleUse: "Pair the number with a human-readable consequence.",
  },
  "block-diagram": {
    description: "Architecture block diagram.",
    narrativeRoles: ["mental-model", "architecture", "explanation"],
    bestFor: ["systems", "agent pipelines", "data flow", "component relationships"],
    avoidWhen: ["the viewer needs a hands-on demo instead of a model"],
    textLimits: { maxVisibleWords: 38, maxWordsPerSecond: 4 },
    durationRange: [5, 14],
    recommendedBeats: 3,
    placement: ["middle"],
    exampleUse: "Reveal blocks in the same order the narration explains them.",
  },
  "browser-mockup": {
    description: "Browser window mockup.",
    narrativeRoles: ["demo", "product-context", "evidence"],
    bestFor: ["web apps", "landing pages", "dashboards", "result screens"],
    avoidWhen: ["no browser UI is relevant"],
    textLimits: { maxVisibleWords: 32, maxWordsPerSecond: 4 },
    durationRange: [4, 12],
    recommendedBeats: 2,
    placement: ["middle"],
    exampleUse: "Show the end result in a realistic browser frame.",
  },
  "bullet-slide": {
    description: "Bullet point slide.",
    narrativeRoles: ["summary", "checklist", "takeaway"],
    bestFor: ["short checklists", "recaps", "criteria"],
    avoidWhen: ["it would create a static text-heavy section"],
    textLimits: { maxVisibleWords: 34, maxWordsPerSecond: 4 },
    durationRange: [3, 8],
    recommendedBeats: 3,
    placement: ["middle", "near-end"],
    exampleUse: "Use bullets as labels for narration, not as full sentences.",
  },
  "chapter-card": {
    description: "Chapter title card.",
    narrativeRoles: ["transition", "orientation", "chapter"],
    bestFor: ["section breaks", "long tutorials", "resetting attention"],
    avoidWhen: ["the video is under 30 seconds"],
    textLimits: { maxVisibleWords: 10, maxWordsPerSecond: 2 },
    durationRange: [1, 3],
    recommendedBeats: 1,
    placement: ["middle"],
    exampleUse: "Use a short label before a new mode of explanation.",
  },
  "code-block": {
    description: "Syntax-highlighted code.",
    narrativeRoles: ["demo", "technical-detail", "proof"],
    bestFor: ["short snippets", "config examples", "important functions"],
    avoidWhen: ["the code cannot fit legibly in one scene"],
    textLimits: { maxVisibleWords: 45, maxWordsPerSecond: 5 },
    durationRange: [5, 14],
    recommendedBeats: 3,
    placement: ["middle"],
    exampleUse: "Highlight only the line that changes the behavior.",
  },
  "code-diff": {
    description: "Code diff visualization.",
    narrativeRoles: ["before-after", "technical-proof", "change"],
    bestFor: ["refactors", "bug fixes", "prompt changes", "config migrations"],
    avoidWhen: ["there are too many changed lines"],
    textLimits: { maxVisibleWords: 50, maxWordsPerSecond: 5 },
    durationRange: [5, 14],
    recommendedBeats: 3,
    placement: ["middle"],
    exampleUse: "Make the removed problem and added fix visually obvious.",
  },
  "comparison-table": {
    description: "Feature comparison table.",
    narrativeRoles: ["comparison", "decision", "proof"],
    bestFor: ["options", "plans", "before/after criteria", "trade-offs"],
    avoidWhen: ["there are more than four columns or dense paragraphs"],
    textLimits: { maxVisibleWords: 42, maxWordsPerSecond: 4 },
    durationRange: [5, 12],
    recommendedBeats: 3,
    placement: ["middle", "near-end"],
    exampleUse: "Use rows as decision criteria, not as marketing copy.",
  },
  "composed-scene": {
    description:
      "Bounded declarative composition of semantic text, groups, cards, metrics, lists, progress, dividers, and spacing.",
    narrativeRoles: ["explanation", "comparison", "summary", "data", "mental-model"],
    bestFor: [
      "novel layouts assembled from standard primitives",
      "mixed metrics and explanatory cards",
      "topic-neutral structured visuals",
    ],
    avoidWhen: [
      "a registered purpose-built scene already fits",
      "the visual requires executable behavior, arbitrary CSS, network data, or unsupported media",
    ],
    textLimits: { maxVisibleWords: 220, maxWordsPerSecond: 4 },
    durationRange: [3, 18],
    recommendedBeats: 3,
    placement: ["first", "middle", "near-end", "last"],
    exampleUse: "Compose a two-column metric-and-explanation layout without creating a new React component.",
  },
  countdown: {
    description: "Countdown animation.",
    narrativeRoles: ["urgency", "transition", "challenge"],
    bestFor: ["timed reveals", "step countdowns", "short challenges"],
    avoidWhen: ["the topic needs calm explanation"],
    textLimits: { maxVisibleWords: 10, maxWordsPerSecond: 2 },
    durationRange: [2, 6],
    recommendedBeats: 3,
    placement: ["first", "middle"],
    exampleUse: "Use sparingly to create anticipation before a reveal.",
  },
  "file-explorer": {
    description: "File tree visualization.",
    narrativeRoles: ["structure", "workflow", "orientation"],
    bestFor: ["repo layouts", "generated files", "where artifacts live"],
    avoidWhen: ["folder names are not relevant to the lesson"],
    textLimits: { maxVisibleWords: 48, maxWordsPerSecond: 5 },
    durationRange: [5, 14],
    recommendedBeats: 3,
    placement: ["middle"],
    exampleUse: "Reveal only the files the viewer needs to understand.",
  },
  "flow-diagram": {
    description: "Flow/process diagram.",
    narrativeRoles: ["process", "workflow", "sequence"],
    bestFor: ["pipelines", "decision flows", "multi-step automation"],
    avoidWhen: ["the flow has more than six steps"],
    textLimits: { maxVisibleWords: 36, maxWordsPerSecond: 4 },
    durationRange: [5, 14],
    recommendedBeats: 3,
    placement: ["middle"],
    exampleUse: "Animate each node as the narration reaches it.",
  },
  "icon-grid": {
    description: "Grid of icons with labels.",
    narrativeRoles: ["overview", "benefits", "categories"],
    bestFor: ["feature sets", "coverage types", "capability groups"],
    avoidWhen: ["labels need explanation longer than two words"],
    textLimits: { maxVisibleWords: 24, maxWordsPerSecond: 3 },
    durationRange: [3, 8],
    recommendedBeats: 3,
    placement: ["middle"],
    exampleUse: "Group features into scannable categories.",
  },
  "logo-wall": {
    description: "Grid of logos.",
    narrativeRoles: ["credibility", "ecosystem", "context"],
    bestFor: ["tool ecosystems", "brand/social proof", "integrations"],
    avoidWhen: ["logos are decorative and do not support the point"],
    textLimits: { maxVisibleWords: 12, maxWordsPerSecond: 2 },
    durationRange: [2, 6],
    recommendedBeats: 1,
    placement: ["middle", "near-end"],
    exampleUse: "Use to show ecosystem breadth, then immediately make a point.",
  },
  "media-card": {
    description: "Image/video card.",
    narrativeRoles: ["evidence", "example", "product-context"],
    bestFor: ["single asset focus", "screenshots", "visual examples"],
    avoidWhen: ["multiple assets need comparison"],
    textLimits: { maxVisibleWords: 22, maxWordsPerSecond: 3 },
    durationRange: [3, 8],
    recommendedBeats: 2,
    placement: ["middle"],
    exampleUse: "Use one concrete visual instead of explaining abstractly.",
  },
  "problem-solution": {
    description: "Problem vs solution split.",
    narrativeRoles: ["problem-solution", "hook", "transformation"],
    bestFor: ["pain point framing", "before/after reasoning", "product value"],
    avoidWhen: ["there is no clear problem state"],
    textLimits: { maxVisibleWords: 28, maxWordsPerSecond: 4 },
    durationRange: [4, 10],
    recommendedBeats: 2,
    placement: ["first", "middle"],
    exampleUse: "Name the friction on the left and the unlocked outcome on the right.",
  },
  "progress-bars": {
    description: "Animated progress bars.",
    narrativeRoles: ["progress", "comparison", "status"],
    bestFor: ["completion", "relative strength", "maturity levels"],
    avoidWhen: ["values are not meaningful or sourced"],
    textLimits: { maxVisibleWords: 24, maxWordsPerSecond: 3 },
    durationRange: [3, 8],
    recommendedBeats: 2,
    placement: ["middle"],
    exampleUse: "Show progress toward a goal, not arbitrary decoration.",
  },
  quote: {
    description: "Styled quotation.",
    narrativeRoles: ["authority", "insight", "pause"],
    bestFor: ["customer voice", "expert insight", "memorable principle"],
    avoidWhen: ["the quote is generic or unsourced"],
    textLimits: { maxVisibleWords: 30, maxWordsPerSecond: 4 },
    durationRange: [3, 8],
    recommendedBeats: 1,
    placement: ["middle", "near-end"],
    exampleUse: "Use a quote to shift from proof to interpretation.",
  },
  "split-screen": {
    description: "Two-panel layout.",
    narrativeRoles: ["comparison", "parallel-demo", "contrast"],
    bestFor: ["two workflows", "input/output", "manual vs automated"],
    avoidWhen: ["each side needs too much text to read"],
    textLimits: { maxVisibleWords: 34, maxWordsPerSecond: 4 },
    durationRange: [4, 12],
    recommendedBeats: 2,
    placement: ["middle"],
    exampleUse: "Keep each side symmetrical and reveal the contrast quickly.",
  },
  "stat-reveal": {
    description: "Animated statistic reveal.",
    narrativeRoles: ["proof", "impact", "surprise"],
    bestFor: ["single metric with context", "result reveal", "performance point"],
    avoidWhen: ["the stat does not change the viewer's belief"],
    textLimits: { maxVisibleWords: 18, maxWordsPerSecond: 3 },
    durationRange: [2, 6],
    recommendedBeats: 1,
    placement: ["first", "middle", "near-end"],
    exampleUse: "Reveal the stat after setting the baseline.",
  },
  "step-list": {
    description: "Numbered step sequence.",
    narrativeRoles: ["process", "how-to", "checklist"],
    bestFor: ["3-5 actions", "tutorial recipes", "setup steps"],
    avoidWhen: ["steps need code or terminal output to be credible"],
    textLimits: { maxVisibleWords: 34, maxWordsPerSecond: 4 },
    durationRange: [4, 10],
    recommendedBeats: 3,
    placement: ["middle", "near-end"],
    exampleUse: "Use verbs at the start of every step.",
  },
  timeline: {
    description: "Timeline visualization.",
    narrativeRoles: ["sequence", "history", "roadmap"],
    bestFor: ["phases", "evolution", "planned rollouts"],
    avoidWhen: ["time order does not matter"],
    textLimits: { maxVisibleWords: 34, maxWordsPerSecond: 4 },
    durationRange: [4, 12],
    recommendedBeats: 3,
    placement: ["middle"],
    exampleUse: "Use to show how a process evolves over time.",
  },
  "two-column-text": {
    description: "Two-column text layout.",
    narrativeRoles: ["comparison", "explanation", "summary"],
    bestFor: ["two concise concepts", "pros/cons", "cause/effect"],
    avoidWhen: ["either column needs more than three short lines"],
    textLimits: { maxVisibleWords: 34, maxWordsPerSecond: 4 },
    durationRange: [3, 8],
    recommendedBeats: 2,
    placement: ["middle", "near-end"],
    exampleUse: "Use columns for contrast, not as a way to fit more text.",
  },
}

const fallbackCustomMetadata = (componentId: string): Omit<SceneCatalogEntry, "componentId" | "composition"> => ({
  description: `Custom scene: ${componentId}`,
  narrativeRoles: ["custom"],
  bestFor: ["specialized visual explanation"],
  avoidWhen: ["an existing registered scene already expresses the idea"],
  textLimits: DEFAULT_TEXT_LIMITS,
  durationRange: [3, 10],
  recommendedBeats: 2,
  placement: ["middle"],
  exampleUse: "Use only when the narrative needs a visual pattern not covered by built-in scenes.",
})

const templates: VideoTemplate[] = [
  {
    templateId: "tutorial-code-walkthrough",
    composition: "ClaudeCodeTutorial",
    description: "Teach one coding workflow by moving from promise to CLI proof to takeaway.",
    bestFor: ["Codex tutorials", "Claude Code commands", "developer workflow demos"],
    avoidWhen: ["there is no realistic command or output to show"],
    targetDurationSeconds: [90, 180],
    narrativeArc: ["promise", "mental model", "setup", "live demo", "why it matters", "pitfalls", "recap"],
    steps: [
      {
        role: "hook",
        preferredScene: "intro",
        fallbackScenes: ["problem-solution"],
        purpose: "State the outcome the viewer gets.",
        durationSeconds: [6, 10],
      },
      {
        role: "mental-model",
        preferredScene: "block-diagram",
        fallbackScenes: ["flow-diagram", "callout"],
        purpose: "Give the viewer a frame for the workflow before details.",
        durationSeconds: [14, 24],
      },
      {
        role: "setup",
        preferredScene: "step-list",
        fallbackScenes: ["bullet-slide", "code-block"],
        purpose: "Prepare prerequisites, context, and what the viewer should watch for.",
        durationSeconds: [12, 22],
      },
      {
        role: "demo",
        preferredScene: "terminal",
        fallbackScenes: ["code-block", "api-request"],
        purpose: "Show a realistic command/result sequence, not just one synthetic line.",
        durationSeconds: [24, 55],
      },
      {
        role: "why-it-matters",
        preferredScene: "flow-diagram",
        fallbackScenes: ["block-diagram", "callout"],
        purpose: "Explain the underlying mechanism and why the workflow saves time.",
        durationSeconds: [14, 28],
      },
      {
        role: "pitfalls",
        preferredScene: "comparison-table",
        fallbackScenes: ["before-after", "bullet-slide"],
        purpose: "Name common mistakes, limits, or when not to use the workflow.",
        durationSeconds: [12, 24],
      },
      {
        role: "summary",
        preferredScene: "outro",
        fallbackScenes: ["step-list"],
        purpose: "Close with 2-3 actions or memory hooks.",
        durationSeconds: [8, 14],
      },
    ],
  },
  {
    templateId: "tutorial-agent-pipeline",
    composition: "ClaudeCodeTutorial",
    description: "Explain an automated agent pipeline with checkpoints and generated artifacts.",
    bestFor: ["multi-agent systems", "DeepAgents workflows", "automation pipelines"],
    avoidWhen: ["the topic is a single command with no orchestration"],
    targetDurationSeconds: [90, 180],
    narrativeArc: [
      "problem",
      "pipeline overview",
      "agent roles",
      "handoffs",
      "artifact proof",
      "human checkpoint",
      "recap",
    ],
    steps: [
      {
        role: "problem",
        preferredScene: "problem-solution",
        fallbackScenes: ["intro"],
        purpose: "Contrast manual effort with automated execution.",
        durationSeconds: [8, 14],
      },
      {
        role: "architecture",
        preferredScene: "flow-diagram",
        fallbackScenes: ["block-diagram"],
        purpose: "Show the full agent chain before details.",
        durationSeconds: [14, 26],
      },
      {
        role: "roles",
        preferredScene: "step-list",
        fallbackScenes: ["icon-grid", "bullet-slide"],
        purpose: "Name each agent by responsibility.",
        durationSeconds: [14, 26],
      },
      {
        role: "handoffs",
        preferredScene: "timeline",
        fallbackScenes: ["flow-diagram", "step-list"],
        purpose: "Show what each agent passes to the next agent and where validation happens.",
        durationSeconds: [14, 28],
      },
      {
        role: "proof",
        preferredScene: "file-explorer",
        fallbackScenes: ["terminal", "code-block"],
        purpose: "Show the concrete files or outputs generated by the pipeline.",
        durationSeconds: [18, 40],
      },
      {
        role: "checkpoint",
        preferredScene: "callout",
        fallbackScenes: ["outro"],
        purpose: "Emphasize that the human approves creative judgment.",
        durationSeconds: [10, 20],
      },
      {
        role: "summary",
        preferredScene: "outro",
        fallbackScenes: ["bullet-slide"],
        purpose: "Close with the repeatable pattern and next action.",
        durationSeconds: [8, 14],
      },
    ],
  },
  {
    templateId: "product-short-offer",
    composition: "ProductShort",
    description: "Fast vertical ad: product promise, benefits, offer, CTA.",
    bestFor: ["Linea Directa product shorts", "offer-led vertical ads", "conversion pieces"],
    avoidWhen: ["no price or concrete CTA is available"],
    targetDurationSeconds: [12, 25],
    narrativeArc: ["offer hook", "benefits", "price/proof", "cta"],
    steps: [
      {
        role: "hook",
        preferredScene: "hero",
        fallbackScenes: ["benefits"],
        purpose: "Make the product and main benefit clear instantly.",
        durationSeconds: [2, 4],
      },
      {
        role: "benefits",
        preferredScene: "benefits",
        fallbackScenes: ["hero"],
        purpose: "Give 2-3 reasons to continue.",
        durationSeconds: [4, 8],
      },
      {
        role: "offer",
        preferredScene: "pricing",
        fallbackScenes: ["benefits"],
        purpose: "Reveal the price or offer after value is established.",
        durationSeconds: [2, 5],
      },
      {
        role: "cta",
        preferredScene: "cta",
        fallbackScenes: ["hero"],
        purpose: "End with one clear action.",
        durationSeconds: [2, 4],
      },
    ],
  },
  {
    templateId: "product-short-problem-solution",
    composition: "ProductShort",
    description: "Vertical ad for products where the pain point is stronger than the offer.",
    bestFor: ["insurance objections", "pain-point hooks", "reassurance-led ads"],
    avoidWhen: ["the user requested a direct price-first ad"],
    targetDurationSeconds: [15, 30],
    narrativeArc: ["pain", "relief", "proof", "cta"],
    steps: [
      {
        role: "pain",
        preferredScene: "hero",
        fallbackScenes: ["benefits"],
        purpose: "Open with the user problem in product language.",
        durationSeconds: [2, 4],
      },
      {
        role: "relief",
        preferredScene: "benefits",
        fallbackScenes: ["hero"],
        purpose: "Translate coverages into reassurance.",
        durationSeconds: [5, 9],
      },
      {
        role: "proof",
        preferredScene: "pricing",
        fallbackScenes: ["benefits"],
        purpose: "Add price, offer, or concrete product proof.",
        durationSeconds: [2, 5],
      },
      {
        role: "cta",
        preferredScene: "cta",
        fallbackScenes: ["hero"],
        purpose: "Ask for the next step once trust is built.",
        durationSeconds: [2, 4],
      },
    ],
  },
]

function componentClassName(componentId: string): string {
  return `${componentId
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")}Scene`
}

function extractPropContract(componentId: string): string | undefined {
  if (componentId === "composed-scene") return JSON.stringify(COMPOSED_SCENE_CONTRACT_SUMMARY)
  const className = componentClassName(componentId)
  const sourcePath = path.resolve(
    __dirname,
    "..",
    "src",
    "compositions",
    "ClaudeCodeTutorial",
    "scenes",
    "custom",
    `${className}.tsx`,
  )
  if (!fs.existsSync(sourcePath)) return undefined
  const sourceText = fs.readFileSync(sourcePath, "utf-8")
  const source = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const preferredName = `${className.replace(/Scene$/, "")}Props`
  const declarations = source.statements.filter(
    (statement): statement is ts.InterfaceDeclaration | ts.TypeAliasDeclaration =>
      ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement),
  )
  const contract =
    declarations.find((declaration) => declaration.name.text === preferredName) ??
    declarations.find((declaration) => declaration.name.text.endsWith("Props"))
  if (!contract) return undefined
  return declarations.map((declaration) => declaration.getText(source)).join("\n\n")
}

const catalog = {
  generatedAt: new Date().toISOString(),
  scenes: {
    tutorial: {
      builtin: ["intro", "terminal", "callout", "outro"].map((type) => builtinScenes[type]),
      custom: [] as SceneCatalogEntry[],
    },
    productShort: {
      builtin: ["hero", "benefits", "pricing", "cta"].map((type) => builtinScenes[type]),
    },
  },
  templates,
}

for (const componentId of Object.keys(customSceneRegistry)) {
  // Slice 4 will publish an exact parent-projected recipe contract. Until then this
  // trusted renderer must not be offered as ordinary model-authored catalog reuse.
  if (componentId === "visual-program") continue
  const metadata = customSceneMetadata[componentId] ?? fallbackCustomMetadata(componentId)
  catalog.scenes.tutorial.custom.push({
    componentId,
    composition: "ClaudeCodeTutorial",
    ...metadata,
    propContract: extractPropContract(componentId),
  })
}

// Resolve path relative to project root
const outPath = path.resolve(__dirname, "..", "src", "shared", "scene-catalog.json")
fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2))
console.log(`Scene catalog written to ${outPath} (${catalog.scenes.tutorial.custom.length} custom scenes)`)
