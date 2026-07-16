import React from "react"
import "./index.css"
import { Composition } from "remotion"
import { ClaudeCodeTutorial } from "./compositions/ClaudeCodeTutorial/ClaudeCodeTutorial"
import { calculateMetadata } from "./compositions/ClaudeCodeTutorial/calculateMetadata"
import { TutorialConfigSchema } from "./compositions/ClaudeCodeTutorial/schema"
import { ProductShort } from "./compositions/ProductShort/ProductShort"
import { calculateMetadata as calculateProductShortMetadata } from "./compositions/ProductShort/calculateMetadata"
import { ProductShortConfigSchema } from "./compositions/ProductShort/schema"
import { PixelLogoPreview } from "./compositions/PixelLogoPreview/PixelLogoPreview"

const defaultTutorialProps = {
  id: "compact-command",
  title: "El comando /compact",
  description: "Cómo usar /compact para comprimir el contexto de Claude Code",
  fps: 30 as const,
  width: 1280 as const,
  height: 720 as const,
  watermark: true,
  theme: "betelgeuse" as const,
  scenes: [
    {
      type: "intro" as const,
      title: "El comando /compact",
      subtitle: "Comprime el contexto sin perder el hilo",
      durationInSeconds: 4,
    },
    {
      type: "terminal" as const,
      title: "Uso básico",
      lines: [
        { kind: "command" as const, text: "claude" },
        { kind: "claude" as const, text: "> Hola, ¿en qué puedo ayudarte hoy?" },
        { kind: "blank" as const, text: "" },
        { kind: "command" as const, text: "/compact" },
        { kind: "output" as const, text: "  Comprimiendo contexto..." },
        { kind: "output" as const, text: "✓ Contexto comprimido. Tokens: 1,200 → 340" },
      ],
      durationInSeconds: 8,
    },
    {
      type: "callout" as const,
      text: "/compact resume toda la conversación anterior en un resumen compacto. Ideal cuando el contexto está lleno pero quieres seguir trabajando.",
      position: "bottom" as const,
      background: "overlay" as const,
      durationInSeconds: 5,
    },
    {
      type: "outro" as const,
      title: "Resumen",
      bullets: [
        "Usa /compact cuando el contexto esté casi lleno",
        "No pierdes el hilo — solo se comprime",
        "Puedes ver cuántos tokens ahorraste",
      ],
      durationInSeconds: 6,
    },
  ],
}

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ClaudeCodeTutorial"
        component={ClaudeCodeTutorial}
        durationInFrames={300}
        fps={30}
        width={1280}
        height={720}
        schema={TutorialConfigSchema}
        defaultProps={defaultTutorialProps}
        calculateMetadata={calculateMetadata}
      />
      <Composition
        id="VerticalShort"
        component={ClaudeCodeTutorial}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        schema={TutorialConfigSchema}
        defaultProps={{
          id: "halpha-solar",
          title: "El Sol en Hα",
          description: "Qué se ve en una imagen solar en H-alpha y por qué",
          composition: "VerticalShort",
          fps: 30 as const,
          width: 1080 as const,
          height: 1920 as const,
          watermark: true,
          theme: "h-alpha" as const,
          scenes: [
            {
              type: "intro" as const,
              title: "El Sol en Hα",
              subtitle: "Otra forma de ver nuestra estrella",
              durationInSeconds: 4,
            },
          ],
        }}
        calculateMetadata={calculateMetadata}
      />
      <Composition
        id="ProductShort"
        component={ProductShort}
        durationInFrames={450}
        fps={30}
        width={1080}
        height={1920}
        schema={ProductShortConfigSchema}
        defaultProps={{
          id: "default",
          composition: "ProductShort" as const,
          product: "Seguro de Coche",
          headline: "Todo riesgo desde 168€/año",
          theme: "linea-directa" as const,
          fps: 30 as const,
          width: 1080 as const,
          height: 1920 as const,
          brief: {
            platform: "shorts",
            audience: "Usuarios comparando seguros desde una pieza rápida en vertical",
            goal: "Presentar propuesta de valor y CTA de forma clara y directa",
            promise: "Precio y beneficio principal quedan claros en pocos segundos",
            tone: "direct-brand",
            cta: "Calcula tu precio",
            hookStrategy: "benefit-first",
          },
          scenes: [
            {
              type: "hero" as const,
              title: "Seguro de Coche",
              durationInSeconds: 4,
              timing: { leadInMs: 450, minVisualHoldMs: 700 },
              beats: [
                {
                  id: "hero-lockup",
                  startMs: 450,
                  narration: "",
                  visual: "Entra la mascota y se fija el beneficio principal",
                  animation: "hero-entry",
                },
              ],
            },
          ],
        }}
        calculateMetadata={calculateProductShortMetadata}
      />
      <Composition
        id="PixelLogoPreview"
        component={PixelLogoPreview}
        durationInFrames={150}
        fps={30}
        width={1280}
        height={720}
      />
    </>
  )
}
