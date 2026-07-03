import React, { useMemo } from "react"
import { AbsoluteFill, Audio, Sequence, continueRender, delayRender, staticFile, useVideoConfig } from "remotion"
import { TransitionSeries, linearTiming, type TransitionPresentation } from "@remotion/transitions"
import { fade } from "@remotion/transitions/fade"
import { slide } from "@remotion/transitions/slide"
import { wipe } from "@remotion/transitions/wipe"
import { ThemeContext, getTheme } from "./themes"
import type { ThemeName } from "./themes"
import { computeMusicVolume, dbToLinear, getSceneSfxEntries, sfxEndFrame, sfxTriggerFrame } from "../utils/audioMix"
import type { Beat, MusicBed, SoundDesign, Timing, TransitionConfig, VoiceoverConfig } from "./schemas"
import { precomputeScenes, type SceneInfo } from "./useScenePrecomputation"
import type { SceneAudioInfo } from "../utils/audioMix"

interface CompositionShellScene {
  type: string
  durationInSeconds: number
  timing?: Timing | null
  beats?: Beat[] | null
  componentId?: string
}

interface CompositionShellConfig<S extends CompositionShellScene> {
  id: string
  fps: number
  soundDesign?: SoundDesign | null
  voiceover?: VoiceoverConfig | null
  scenes: S[]
  transition?: TransitionConfig | null
}

interface CompositionShellProps<S extends CompositionShellScene> {
  config: CompositionShellConfig<S>
  theme: ThemeName
  renderScene: (scene: S, index: number) => React.ReactNode
  renderOverlay?: (scene: S, info: SceneInfo<S>, index: number) => React.ReactNode
  musicLoop?: boolean
}

function ThemeFontLoader({ theme }: { theme: ThemeName }) {
  const fontFaces = getTheme(theme).fontFaces
  const [handle] = React.useState(() => (fontFaces?.length ? delayRender(`Loading ${theme} fonts`) : null))

  React.useEffect(() => {
    if (!fontFaces?.length || handle === null) return

    let cancelled = false
    const loadFonts = async () => {
      if (typeof FontFace === "undefined" || typeof document === "undefined") return
      await Promise.all(
        fontFaces.map(async (font) => {
          const face = new FontFace(font.family, `url(${staticFile(font.file)})`, {
            weight: font.weight ?? "400",
            style: font.style ?? "normal",
          })
          const loaded = await face.load()
          if (!cancelled) document.fonts.add(loaded)
        }),
      )
      await document.fonts.ready
    }

    loadFonts()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) continueRender(handle)
      })

    return () => {
      cancelled = true
    }
  }, [fontFaces, handle, theme])

  return null
}

export function CompositionShell<S extends CompositionShellScene>({
  config,
  theme,
  renderScene,
  renderOverlay,
  musicLoop,
}: CompositionShellProps<S>) {
  const { durationInFrames: totalDurationInFrames } = useVideoConfig()
  const bg = getTheme(theme).background

  const { sceneInfos, sceneAudioInfos } = useMemo(
    () => precomputeScenes(config.scenes, { fps: config.fps, voiceover: config.voiceover }),
    [config.scenes, config.fps, config.voiceover],
  )

  const transitionType = config.transition?.type ?? "none"
  const transitionDuration = config.transition?.durationInFrames ?? 15

  function getPresentation(): TransitionPresentation<Record<string, unknown>> | null {
    switch (transitionType) {
      case "fade":
        return fade() as TransitionPresentation<Record<string, unknown>>
      case "slide":
        return slide() as TransitionPresentation<Record<string, unknown>>
      case "wipe":
        return wipe() as TransitionPresentation<Record<string, unknown>>
      default:
        return null
    }
  }
  const presentation = getPresentation()
  const transitionTiming = presentation ? linearTiming({ durationInFrames: transitionDuration }) : undefined

  return (
    <ThemeContext.Provider value={theme}>
      <AbsoluteFill style={{ background: bg }}>
        <ThemeFontLoader theme={theme} />
        {config.soundDesign?.enabled && config.soundDesign.musicBed && (
          <Audio
            src={staticFile(`audio/${config.id}/music-bed.mp3`)}
            volume={(f) =>
              computeMusicVolume(
                f,
                sceneAudioInfos,
                config.soundDesign!.musicBed as MusicBed,
                config.fps,
                totalDurationInFrames,
              )
            }
            {...(musicLoop ? { loop: true } : {})}
          />
        )}
        <TransitionSeries>
          {sceneInfos.flatMap((info, i) => {
            const { directedScene, durationInFrames, timing, hasVoiceover, audioDelayFrames } = info
            const elements: React.ReactNode[] = []
            if (i > 0 && presentation && transitionTiming) {
              elements.push(
                <TransitionSeries.Transition key={`t-${i}`} presentation={presentation} timing={transitionTiming} />,
              )
            }
            elements.push(
              <TransitionSeries.Sequence key={i} durationInFrames={durationInFrames}>
                {hasVoiceover && (
                  <Sequence from={audioDelayFrames}>
                    <Audio src={staticFile(`voiceover/${config.id}/${i}.mp3`)} />
                  </Sequence>
                )}
                {config.soundDesign?.enabled &&
                  getSceneSfxEntries(i, sceneAudioInfos[i].sceneType, config.soundDesign as SoundDesign).map((sfx) => {
                    const triggerFrame = sfxTriggerFrame(sfx, timing ?? undefined, config.fps)
                    const endFrame = sfxEndFrame(sfx, durationInFrames)
                    return (
                      <Sequence from={triggerFrame} key={sfx.id}>
                        <Audio
                          src={staticFile(`audio/${config.id}/sfx-${sfx.id}.mp3`)}
                          volume={() => dbToLinear(sfx.volume)}
                          {...(sfx.loop
                            ? { loop: true, ...(endFrame !== undefined ? { endAt: endFrame - triggerFrame } : {}) }
                            : {})}
                        />
                      </Sequence>
                    )
                  })}
                {renderScene(directedScene, i)}
                {renderOverlay?.(directedScene, info, i)}
              </TransitionSeries.Sequence>,
            )
            return elements
          })}
        </TransitionSeries>
      </AbsoluteFill>
    </ThemeContext.Provider>
  )
}

export type { SceneInfo, SceneAudioInfo }
