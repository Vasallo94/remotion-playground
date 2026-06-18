import React from "react"
import "./index.css"
import { Composition, Folder } from "remotion"
import { ClaudeCodeTutorial } from "./compositions/ClaudeCodeTutorial/ClaudeCodeTutorial"
import { calculateMetadata } from "./compositions/ClaudeCodeTutorial/calculateMetadata"
import type { TutorialConfig } from "./compositions/ClaudeCodeTutorial/schema"
import { ProductShort } from "./compositions/ProductShort/ProductShort"
import { calculateMetadata as calculateProductShortMetadata } from "./compositions/ProductShort/calculateMetadata"
import type { ProductShortConfig } from "./compositions/ProductShort/schema"
import { PixelLogoPreview } from "./compositions/PixelLogoPreview/PixelLogoPreview"
import { tutorials, shorts } from "./generated/tutorialManifest"

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {tutorials.length > 0 && (
        <Composition
          id="ClaudeCodeTutorial"
          component={ClaudeCodeTutorial}
          durationInFrames={300}
          fps={30}
          width={1280}
          height={720}
          defaultProps={tutorials[0].config}
          calculateMetadata={calculateMetadata}
        />
      )}
      {shorts.length > 0 && (
        <Composition
          id="ProductShort"
          component={ProductShort}
          durationInFrames={450}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={shorts[0].config}
          calculateMetadata={calculateProductShortMetadata}
        />
      )}
      <Composition
        id="PixelLogoPreview"
        component={PixelLogoPreview}
        durationInFrames={150}
        fps={30}
        width={1280}
        height={720}
      />

      {tutorials.length > 0 && (
        <Folder name="Tutorials">
          {tutorials.map((entry) => (
            <Composition
              key={entry.compositionId}
              id={entry.compositionId}
              component={ClaudeCodeTutorial}
              durationInFrames={300}
              fps={30}
              width={1280}
              height={720}
              defaultProps={entry.config as TutorialConfig}
              calculateMetadata={calculateMetadata}
            />
          ))}
        </Folder>
      )}

      {shorts.length > 0 && (
        <Folder name="Shorts">
          {shorts.map((entry) => (
            <Composition
              key={entry.compositionId}
              id={entry.compositionId}
              component={ProductShort}
              durationInFrames={450}
              fps={30}
              width={1080}
              height={1920}
              defaultProps={entry.config as ProductShortConfig}
              calculateMetadata={calculateProductShortMetadata}
            />
          ))}
        </Folder>
      )}
    </>
  )
}
