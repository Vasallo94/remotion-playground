import React from "react"
import { continueRender, delayRender, staticFile } from "remotion"
import { TutorialConfig } from "./schema"
import { getTheme } from "../../shared/themes"
import { IntroScene } from "./scenes/IntroScene"
import { TerminalScene } from "./scenes/TerminalScene"
import { CalloutScene } from "./scenes/CalloutScene"
import { OutroScene } from "./scenes/OutroScene"
import { CustomScene } from "./scenes/CustomScene"
import { HeroScene } from "../ProductShort/scenes/HeroScene"
import { BenefitsScene } from "../ProductShort/scenes/BenefitsScene"
import { PricingScene } from "../ProductShort/scenes/PricingScene"
import { CtaScene } from "../ProductShort/scenes/CtaScene"
import { KaraokeSubtitles, type WordTimestamp } from "../../shared/components/KaraokeSubtitles"
import { LogoWatermark } from "../../shared/components/LogoWatermark"
import { SignatureWatermark } from "../../shared/components/SignatureWatermark"
import { CompositionShell } from "../../shared/CompositionShell"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SCENE_MAP: Record<string, React.FC<any>> = {
  intro: IntroScene,
  terminal: TerminalScene,
  callout: CalloutScene,
  outro: OutroScene,
  custom: CustomScene,
  hero: HeroScene,
  benefits: BenefitsScene,
  pricing: PricingScene,
  cta: CtaScene,
}

function useTimestamps(configId: string, sceneCount: number, enabled: boolean): (WordTimestamp[] | null)[] {
  const [timestamps, setTimestamps] = React.useState<(WordTimestamp[] | null)[]>(() =>
    Array.from({ length: sceneCount }, () => null),
  )
  const [handle] = React.useState(() => (enabled ? delayRender("Loading subtitle timestamps") : null))

  React.useEffect(() => {
    if (!enabled) return

    const loadAll = async () => {
      const results = await Promise.all(
        Array.from({ length: sceneCount }, async (_, i) => {
          try {
            const res = await fetch(staticFile(`voiceover/${configId}/${i}.timestamps.json`))
            return res.ok ? ((await res.json()) as WordTimestamp[]) : null
          } catch {
            return null
          }
        }),
      )
      setTimestamps(results)
      if (handle !== null) continueRender(handle)
    }

    loadAll()
  }, [configId, sceneCount, enabled, handle])

  return timestamps
}

export const ClaudeCodeTutorial: React.FC<TutorialConfig> = (config) => {
  const theme = getTheme(config.theme ?? "betelgeuse")
  const subtitlesEnabled = config.subtitles?.enabled !== false && Boolean(config.voiceover?.enabled)
  const sceneTimestamps = useTimestamps(config.id, config.scenes.length, subtitlesEnabled)
  const signature = config.watermark === false ? null : (config.signature ?? null)
  const showLogoWatermark = config.watermark !== false && !theme.mascot.show && !signature

  return (
    <CompositionShell
      config={config}
      theme={config.theme ?? "betelgeuse"}
      renderScene={(scene) => {
        const Scene = SCENE_MAP[scene.type]
        return Scene ? <Scene {...scene} showThemeLabel={config.watermark !== false} /> : null
      }}
      renderOverlay={(scene, info, i) => (
        <>
          {subtitlesEnabled && sceneTimestamps[i] && (
            <KaraokeSubtitles
              timestamps={sceneTimestamps[i]!}
              audioDelayFrames={info.audioDelayFrames}
              position={config.subtitles?.position ?? "bottom"}
              fontSize={config.subtitles?.fontSize ?? 32}
            />
          )}
          {signature && scene.type !== "intro" && <SignatureWatermark text={signature} />}
          {showLogoWatermark && scene.type !== "intro" && <LogoWatermark />}
        </>
      )}
    />
  )
}
