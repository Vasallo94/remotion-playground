import React, { useMemo } from "react"
import { Player } from "@remotion/player"
import { calculateTotalFrames } from "@remotion-src/shared/calculateDuration"
import { useAppTheme } from "../hooks/useAppTheme"

interface VideoConfig {
  composition?: string
  fps?: number
  width?: number
  height?: number
  scenes: Array<{ durationInSeconds: number }>
  transition?: { type?: string; durationInFrames?: number }
  [key: string]: unknown
}

interface Props {
  config: VideoConfig
  style?: React.CSSProperties
}

// Named exports require re-exporting as default for React.lazy
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Composition props vary per composition type
type CompositionComponent = React.ComponentType<any>
const COMPOSITIONS: Record<string, React.LazyExoticComponent<CompositionComponent>> = {
  ClaudeCodeTutorial: React.lazy(() =>
    import("@remotion-src/compositions/ClaudeCodeTutorial/ClaudeCodeTutorial").then((m) => ({
      default: m.ClaudeCodeTutorial,
    })),
  ),
  ProductShort: React.lazy(() =>
    import("@remotion-src/compositions/ProductShort/ProductShort").then((m) => ({ default: m.ProductShort })),
  ),
}

export function VideoPlayer({ config, style }: Props) {
  const { theme } = useAppTheme()
  const compositionId = config.composition || "ClaudeCodeTutorial"
  const Component = COMPOSITIONS[compositionId]
  const fps = config.fps || 30
  const width = config.width || (compositionId === "ProductShort" ? 1080 : 1280)
  const height = config.height || (compositionId === "ProductShort" ? 1920 : 720)

  const durationInFrames = useMemo(
    () => calculateTotalFrames(config.scenes, fps, config.transition),
    [config.scenes, fps, config.transition],
  )

  if (!Component) return null

  return (
    <div style={{ borderRadius: theme.radius.md, overflow: "hidden", backgroundColor: "#000", ...style }}>
      <React.Suspense
        fallback={
          <div
            style={{
              width: "100%",
              aspectRatio: `${width}/${height}`,
              backgroundColor: "#000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: theme.colors.text.muted,
              fontSize: 13,
            }}
          >
            Cargando preview...
          </div>
        }
      >
        <Player
          component={Component}
          durationInFrames={durationInFrames}
          fps={fps}
          compositionWidth={width}
          compositionHeight={height}
          inputProps={config}
          controls
          style={{ width: "100%" }}
          autoPlay={false}
        />
      </React.Suspense>
    </div>
  )
}
