// src/compositions/ClaudeCodeTutorial/customSceneRegistry.ts
// IMPORTANT: Remotion bundles at compile time. All custom components
// must be registered here with a static import. NO dynamic imports.

import { type FC } from "react"
import { AnnotatedImageScene } from "./scenes/custom/AnnotatedImageScene"
import { ApiRequestScene } from "./scenes/custom/ApiRequestScene"
import { BarChartScene } from "./scenes/custom/BarChartScene"
import { BeforeAfterScene } from "./scenes/custom/BeforeAfterScene"
import { BigNumberScene } from "./scenes/custom/BigNumberScene"
import { BlockDiagramScene } from "./scenes/custom/BlockDiagramScene"
import { BrowserMockupScene } from "./scenes/custom/BrowserMockupScene"
import { BulletSlideScene } from "./scenes/custom/BulletSlideScene"
import { ChapterCardScene } from "./scenes/custom/ChapterCardScene"
import { CodeBlockScene } from "./scenes/custom/CodeBlockScene"
import { CodeDiffScene } from "./scenes/custom/CodeDiffScene"
import { ComparisonTableScene } from "./scenes/custom/ComparisonTableScene"
import { CountdownScene } from "./scenes/custom/CountdownScene"
import { FileExplorerScene } from "./scenes/custom/FileExplorerScene"
import { FlowDiagramScene } from "./scenes/custom/FlowDiagramScene"
import { IconGridScene } from "./scenes/custom/IconGridScene"
import { LogoWallScene } from "./scenes/custom/LogoWallScene"
import { MediaCardScene } from "./scenes/custom/MediaCardScene"
import { ProblemSolutionScene } from "./scenes/custom/ProblemSolutionScene"
import { ProgressBarsScene } from "./scenes/custom/ProgressBarsScene"
import { QuoteScene } from "./scenes/custom/QuoteScene"
import { SplitScreenScene } from "./scenes/custom/SplitScreenScene"
import { StatRevealScene } from "./scenes/custom/StatRevealScene"
import { StepListScene } from "./scenes/custom/StepListScene"
import { TimelineScene } from "./scenes/custom/TimelineScene"
import { AutoRepairLoopScene } from "./scenes/custom/AutoRepairLoopScene"
import { HookArchitectureScene } from "./scenes/custom/HookArchitectureScene"
import { SettingsJsonScene } from "./scenes/custom/SettingsJsonScene"
import { TwoColumnTextScene } from "./scenes/custom/TwoColumnTextScene"

export const customSceneRegistry: Record<string, FC<Record<string, unknown>>> = {
  "annotated-image": AnnotatedImageScene,
  "api-request": ApiRequestScene,
  "bar-chart": BarChartScene,
  "before-after": BeforeAfterScene,
  "big-number": BigNumberScene,
  "block-diagram": BlockDiagramScene,
  "browser-mockup": BrowserMockupScene,
  "bullet-slide": BulletSlideScene,
  "chapter-card": ChapterCardScene,
  "code-block": CodeBlockScene,
  "code-diff": CodeDiffScene,
  "comparison-table": ComparisonTableScene,
  countdown: CountdownScene,
  "file-explorer": FileExplorerScene,
  "flow-diagram": FlowDiagramScene,
  "icon-grid": IconGridScene,
  "problem-solution": ProblemSolutionScene,
  "progress-bars": ProgressBarsScene,
  quote: QuoteScene,
  "split-screen": SplitScreenScene,
  "stat-reveal": StatRevealScene,
  timeline: TimelineScene,
  "media-card": MediaCardScene,
  "logo-wall": LogoWallScene,
  "two-column-text": TwoColumnTextScene,
  "step-list": StepListScene,
  HookArchitectureScene: HookArchitectureScene,
  SettingsJsonScene: SettingsJsonScene,
  AutoRepairLoopScene: AutoRepairLoopScene,
}
