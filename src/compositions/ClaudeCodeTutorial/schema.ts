// src/compositions/ClaudeCodeTutorial/schema.ts
import { z } from "zod"
import {
  BriefSchema,
  DirectionSceneFieldsSchema,
  SoundDesignSchema,
  TransitionConfigSchema,
  VoiceoverConfigSchema,
} from "../../shared/schemas"

const PixelLogoSchema = z.object({
  enabled: z.boolean().default(true),
  scale: z.number().min(1).max(12).nullable().optional(),
  animation: z.enum(["none", "build", "glint", "pulse"]).nullable().optional(),
})

const IntroSceneSchema = z
  .object({
    type: z.literal("intro"),
    title: z.string(),
    subtitle: z.string().nullable().optional(),
    pixelLogo: PixelLogoSchema.nullable().optional(),
    durationInSeconds: z.number().min(1).max(30),
  })
  .merge(DirectionSceneFieldsSchema)

const TerminalLineSchema = z.object({
  kind: z.enum(["command", "output", "claude", "blank"]),
  text: z.string(),
  delayAfterMs: z.number().int().min(0).nullable().optional(),
})

const TerminalSceneSchema = z
  .object({
    type: z.literal("terminal"),
    title: z.string().nullable().optional(),
    lines: z.array(TerminalLineSchema).min(1),
    durationInSeconds: z.number().min(2).max(120),
  })
  .merge(DirectionSceneFieldsSchema)

const CalloutSceneSchema = z
  .object({
    type: z.literal("callout"),
    text: z.string(),
    position: z.enum(["top", "center", "bottom", "right"]),
    background: z.enum(["overlay", "solid"]).default("overlay"),
    durationInSeconds: z.number().min(1).max(15),
  })
  .merge(DirectionSceneFieldsSchema)

const OutroSceneSchema = z
  .object({
    type: z.literal("outro"),
    title: z.string(),
    bullets: z.array(z.string()).nullable().optional(),
    durationInSeconds: z.number().min(2).max(20),
  })
  .merge(DirectionSceneFieldsSchema)

const CustomSceneSchema = z
  .object({
    type: z.literal("custom"),
    componentId: z.string(),
    durationInSeconds: z.number().min(1).max(120),
    props: z.record(z.string(), z.any()).nullable().optional(),
  })
  .merge(DirectionSceneFieldsSchema)

const BenefitItemSchema = z.object({ text: z.string() })

const HeroSceneSchema = z
  .object({
    type: z.literal("hero"),
    title: z.string(),
    subtitle: z.string().nullable().optional(),
    durationInSeconds: z.number().min(1).max(30),
  })
  .merge(DirectionSceneFieldsSchema)

const BenefitsSceneSchema = z
  .object({
    type: z.literal("benefits"),
    title: z.string().nullable().optional(),
    items: z.array(BenefitItemSchema).min(1),
    durationInSeconds: z.number().min(2).max(30),
  })
  .merge(DirectionSceneFieldsSchema)

const PricingSceneSchema = z
  .object({
    type: z.literal("pricing"),
    price: z.string(),
    period: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
    variant: z.enum(["light", "dark"]),
    durationInSeconds: z.number().min(1).max(15),
  })
  .merge(DirectionSceneFieldsSchema)

const CtaSceneSchema = z
  .object({
    type: z.literal("cta"),
    text: z.string(),
    url: z.string().nullable().optional(),
    durationInSeconds: z.number().min(1).max(15),
  })
  .merge(DirectionSceneFieldsSchema)

const SceneSchema = z.union([
  IntroSceneSchema,
  TerminalSceneSchema,
  CalloutSceneSchema,
  OutroSceneSchema,
  CustomSceneSchema,
  HeroSceneSchema,
  BenefitsSceneSchema,
  PricingSceneSchema,
  CtaSceneSchema,
])

const SubtitlesConfigSchema = z.object({
  enabled: z.boolean().default(true),
  style: z.enum(["karaoke", "chunks"]).default("karaoke"),
  fontSize: z.number().min(16).max(64).default(32),
  position: z.enum(["bottom", "top"]).default("bottom"),
})

export const TutorialConfigSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  fps: z.literal(30),
  width: z.union([z.literal(1280), z.literal(1080)]),
  height: z.union([z.literal(720), z.literal(1920)]),
  composition: z.string().nullable().optional(),
  signature: z.string().nullable().optional(),
  watermark: z.boolean().default(true),
  theme: z.enum(["default", "linea-directa", "atom-dark", "h-alpha", "claqueta", "betelgeuse"]).default("betelgeuse"),
  brief: BriefSchema.nullable().optional(),
  scenes: z.array(SceneSchema).min(1),
  voiceover: VoiceoverConfigSchema.nullable().optional(),
  soundDesign: SoundDesignSchema.nullable().optional(),
  subtitles: SubtitlesConfigSchema.nullable().optional(),
  // Zod data field, not a CSS transition.
  // eslint-disable-next-line @remotion/non-pure-animation
  transition: TransitionConfigSchema,
})

export type TutorialConfig = z.infer<typeof TutorialConfigSchema>
export type TerminalLine = z.infer<typeof TerminalLineSchema>
export type ThemeName = TutorialConfig["theme"]

// Scene prop types — use these instead of Extract<...> in scene components
export type IntroSceneProps = z.infer<typeof IntroSceneSchema>
export type TerminalSceneProps = z.infer<typeof TerminalSceneSchema>
export type CalloutSceneProps = z.infer<typeof CalloutSceneSchema>
export type OutroSceneProps = z.infer<typeof OutroSceneSchema>
export type CustomSceneProps = z.infer<typeof CustomSceneSchema>
export type HeroSceneProps = z.infer<typeof HeroSceneSchema>
export type BenefitsSceneProps = z.infer<typeof BenefitsSceneSchema>
export type PricingSceneProps = z.infer<typeof PricingSceneSchema>
export type CtaSceneProps = z.infer<typeof CtaSceneSchema>
